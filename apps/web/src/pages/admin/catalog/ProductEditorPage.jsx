import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import JsBarcode from "jsbarcode";
import { apiJson, apiUploadProductImages } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";
import { useAdminPerm } from "../AdminPermContext.jsx";
import { connectJspm, getInstalledPrinters, sendTsplToInstalledPrinter } from "../../../lib/jspmClient.js";
import { CatalogQuickCreateModals, SearchableSelect } from "./ProductEditorCatalogExtras.jsx";

/** Match a variant row to persisted variants after POST/PATCH (name first, then named-row order). */
function resolveVariantIdFromSavedProduct(savedProduct, localVariants, variantIdx, variantName) {
  const wantedName = String(variantName ?? "").trim();
  const savedList = Array.isArray(savedProduct?.variants) ? savedProduct.variants : [];
  let matched = wantedName ? savedList.find((v) => String(v.variant_name ?? "").trim() === wantedName) : null;
  if (!matched && wantedName) {
    const namedIndices = localVariants
      .map((v, idx) => (String(v.variant_name ?? "").trim() ? idx : -1))
      .filter((idx) => idx >= 0);
    const pos = namedIndices.indexOf(variantIdx);
    const savedNamed = savedList.filter((v) => String(v.variant_name ?? "").trim());
    matched = pos >= 0 && pos < savedNamed.length ? savedNamed[pos] : null;
  }
  const vid = matched?.id != null ? Number(matched.id) : null;
  return vid != null && !Number.isNaN(vid) && vid > 0 ? vid : null;
}

/** Code 128 preview aligned with TSPL label output. */
function VariantBarcodePreview({ barcode }) {
  const svgRef = useRef(null);
  const code = String(barcode ?? "").trim();

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.replaceChildren();
    if (!code) return;
    try {
      JsBarcode(el, code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 11,
        height: 48,
        width: 1.85,
        margin: 6,
        background: "#ffffff",
        lineColor: "#0f172a",
      });
    } catch {
      /* invalid characters / length for Code 128 */
    }
  }, [code]);

  if (!code) {
    return (
      <p className="text-[11px] text-slate-500 leading-snug">
        No barcode yet. Save with auto-barcodes on, or type a code — TSPL labels use Code 128 like this preview.
      </p>
    );
  }
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white p-2">
      <svg ref={svgRef} className="block max-w-full" role="img" aria-label="Barcode preview" />
    </div>
  );
}

function emptyVariant() {
  return {
    id: null,
    variant_name: "",
    sku: "",
    attribute_name: "",
    attribute_value: "",
    barcode: "",
    quantity: "",
    image_path: "",
    is_active: true,
    price: "",
    sale_price: "",
    cost_price: "",
    gst_percent: "",
    max_discount_percent: "",
  };
}

function variantProfitPreview(variantRow) {
  const mrp = parseFloat(String(variantRow.price ?? "")) || 0;
  const sale = parseFloat(String(variantRow.sale_price ?? "")) || 0;
  const selling = sale > 0 && sale < mrp ? sale : mrp;
  const costRaw = parseFloat(String(variantRow.cost_price ?? ""));
  const cost = Number.isFinite(costRaw) ? Math.max(0, costRaw) : 0;
  const hasCostField = String(variantRow.cost_price ?? "").trim() !== "";
  const hasSelling = selling > 0;
  if (!hasSelling && !hasCostField) return null;
  const grossPerUnit = hasSelling ? selling - cost : null;
  const marginPct = grossPerUnit != null && selling > 0 ? (grossPerUnit / selling) * 100 : null;
  return {
    selling,
    cost,
    grossPerUnit,
    marginPct,
    hasSelling,
    hasCostField,
    usesSalePrice: sale > 0 && sale < mrp,
  };
}

function baseSellingPrice(priceStr, saleStr) {
  const sale = parseFloat(String(saleStr ?? "")) || 0;
  const price = parseFloat(String(priceStr ?? "")) || 0;
  return sale > 0 ? sale : price;
}

function fmtInr(n) {
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initialProductForm() {
  return {
    name: "",
    slug: "",
    description: "",
    category_id: "",
    subcategory_id: "",
    brand_id: "",
    model_id: "",
    compatible_model_ids: [],
    sku: "",
    price: "",
    sale_price: "",
    cost_price: "",
    stock_quantity: "0",
    gst_percent: "",
    max_discount_percent: "",
    hsn_code: "",
    no_store_stock: false,
    is_active: true,
    is_featured: false,
    meta_title: "",
    meta_description: "",
    shop_id: "",
  };
}

export default function ProductEditorPage() {
  const { catalogScope } = useAdminPerm();
  const catalogShopIds = Array.isArray(catalogScope?.catalog_shop_ids) ? catalogScope.catalog_shop_ids : null;
  const canPickShop =
    !!catalogScope?.can_filter_all_shops ||
    (catalogShopIds != null && catalogShopIds.length > 1);
  const enforcedShopLabel =
    catalogScope?.shop_name ||
    (catalogScope?.staff_shop_id != null ? `Shop #${catalogScope.staff_shop_id}` : null);
  const catalogShopIdsKey = catalogShopIds?.join(",") ?? "";

  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  /** Path-based so we never treat `/products/:id/edit` as create if `id` is missing from params (router quirks). */
  const isCreate = /\/products\/create\/?$/.test(location.pathname);

  const askDelete = useDeleteConfirm();

  const [meta, setMeta] = useState({ categories: [], subcategories: [], brands: [], models: [] });
  const [shops, setShops] = useState([]);
  const [metaErr, setMetaErr] = useState(null);
  const [metaReady, setMetaReady] = useState(false);
  const [detailLoading, setDetailLoading] = useState(() => !isCreate);
  const [loadErr, setLoadErr] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => initialProductForm());
  /** ₹ helper inputs per variant row index (not persisted). */
  const [variantDiscountAmountDraft, setVariantDiscountAmountDraft] = useState({});
  const [variants, setVariants] = useState([emptyVariant()]);
  const [autoVariantBarcodes, setAutoVariantBarcodes] = useState(true);
  const [generateMissingBarcodes, setGenerateMissingBarcodes] = useState(false);
  const [printerName, setPrinterName] = useState("");
  const [installedPrinters, setInstalledPrinters] = useState([]);
  const [jspmReady, setJspmReady] = useState(false);
  const [galleryPreview, setGalleryPreview] = useState([]);
  const [imageUploadMsg, setImageUploadMsg] = useState(null);
  const [imageUploadErr, setImageUploadErr] = useState(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [pendingImageUpload, setPendingImageUpload] = useState(null);
  const [labelQtyByVariant, setLabelQtyByVariant] = useState({});
  const [labelOddSlotByVariant, setLabelOddSlotByVariant] = useState({});
  const [compatBrandFilter, setCompatBrandFilter] = useState("all");
  const [compatQuery, setCompatQuery] = useState("");
  /** When true, show compatible-models picker and persist `compatible_model_ids`; when false, single Model dropdown and `model_id`. */
  const [compatModelsMode, setCompatModelsMode] = useState(false);
  /** Django-style inline taxonomy create from product form (`null` = closed). */
  const [quickAdd, setQuickAdd] = useState(null);

  function applyLoadedProduct(p) {
    setVariantDiscountAmountDraft({});
    setForm({
      name: p.name ?? "",
      slug: p.slug ?? "",
      description: p.description ?? "",
      category_id: p.category_id != null ? String(p.category_id) : "",
      subcategory_id: p.subcategory_id != null ? String(p.subcategory_id) : "",
      brand_id: p.brand_id != null ? String(p.brand_id) : "",
      model_id: p.model_id != null ? String(p.model_id) : "",
      compatible_model_ids: Array.isArray(p.compatible_model_ids)
        ? p.compatible_model_ids.map((x) => String(x))
        : [],
      sku: p.sku ?? "",
      price: p.price != null ? String(p.price) : "",
      sale_price: p.sale_price != null ? String(p.sale_price) : "",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : "0",
      gst_percent: p.gst_percent != null && p.gst_percent !== "" ? String(p.gst_percent) : "",
      max_discount_percent:
        p.max_discount_percent != null && p.max_discount_percent !== "" ? String(p.max_discount_percent) : "",
      hsn_code: p.hsn_code != null ? String(p.hsn_code) : "",
      no_store_stock: !!(p.no_store_stock === 1 || p.no_store_stock === true),
      is_active: !!(p.is_active === 1 || p.is_active === true),
      is_featured: !!(p.is_featured === 1 || p.is_featured === true),
      meta_title: p.meta_title ?? "",
      meta_description: p.meta_description ?? "",
      shop_id: p.shop_id != null ? String(p.shop_id) : "",
    });
    const vlist =
      Array.isArray(p.variants) && p.variants.length
        ? p.variants
        : [
            {
              ...emptyVariant(),
              quantity: p.stock_quantity != null && p.stock_quantity !== "" ? String(p.stock_quantity) : "",
              price: p.price != null && p.price !== "" ? String(p.price) : "",
              sale_price: p.sale_price != null && p.sale_price !== "" ? String(p.sale_price) : "",
              cost_price: p.cost_price != null && p.cost_price !== "" ? String(p.cost_price) : "",
              gst_percent: p.gst_percent != null && p.gst_percent !== "" ? String(p.gst_percent) : "",
              max_discount_percent:
                p.max_discount_percent != null && p.max_discount_percent !== "" ? String(p.max_discount_percent) : "",
            },
          ];
    setVariants(
      vlist.map((v) => ({
        id: v.id ?? null,
        variant_name: v.variant_name ?? "",
        sku: v.sku != null ? String(v.sku) : "",
        attribute_name: v.attribute_name != null ? String(v.attribute_name) : "",
        attribute_value: v.attribute_value != null ? String(v.attribute_value) : "",
        barcode: v.barcode != null ? String(v.barcode) : "",
        quantity: v.quantity != null && v.quantity !== "" ? String(v.quantity) : "",
        image_path: v.image_path ?? "",
        is_active: !(v.is_active === 0 || v.is_active === false),
        price: v.price != null && v.price !== "" ? String(v.price) : "",
        sale_price: v.sale_price != null && v.sale_price !== "" ? String(v.sale_price) : "",
        cost_price: v.cost_price != null && v.cost_price !== "" ? String(v.cost_price) : "",
        gst_percent: v.gst_percent != null && v.gst_percent !== "" ? String(v.gst_percent) : "",
        max_discount_percent:
          v.max_discount_percent != null && v.max_discount_percent !== "" ? String(v.max_discount_percent) : "",
      }))
    );
    const imgs = [...(p.images || [])];
    imgs.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    setGalleryPreview(imgs);
    setCompatModelsMode(Array.isArray(p.compatible_model_ids) && p.compatible_model_ids.length > 0);
  }

  function replaceGalleryPreviewFromProduct(p) {
    const imgs = [...(p?.images || [])];
    imgs.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    setGalleryPreview(imgs);
    const byVariantId = new Map(
      (Array.isArray(p?.variants) ? p.variants : [])
        .filter((v) => v?.id != null)
        .map((v) => [Number(v.id), v.image_path ?? ""])
    );
    setVariants((list) =>
      list.map((row) => {
        const rid = row?.id != null ? Number(row.id) : NaN;
        if (!Number.isFinite(rid) || rid <= 0 || !byVariantId.has(rid)) return row;
        return { ...row, image_path: byVariantId.get(rid) ?? "" };
      })
    );
  }

  function closePendingImageUpload() {
    setPendingImageUpload((prev) => {
      if (prev?.preview_url) {
        URL.revokeObjectURL(prev.preview_url);
      }
      return null;
    });
  }

  function queueImageUpload(files, options = {}) {
    const list = Array.isArray(files) ? files : Array.from(files || []);
    if (!list.length) return;
    const first = list[0];
    const preview_url = first?.type?.startsWith?.("image/") ? URL.createObjectURL(first) : null;
    const variantIdx = options.variantIdx ?? null;
    const row =
      Number.isFinite(Number(variantIdx)) && Number(variantIdx) >= 0 ? variants[Number(variantIdx)] : null;
    setPendingImageUpload({
      mode: options.mode === "variant" ? "variant" : "gallery",
      variant_idx: variantIdx,
      variant_name: row?.variant_name != null ? String(row.variant_name) : "",
      variant_id: row?.id != null && row.id !== "" ? Number(row.id) : null,
      variants_snapshot: variants.map((v) => ({ ...v })),
      files: list,
      preview_url,
    });
  }

  const loadMeta = useCallback(async () => {
    const [c, s, b, m] = await Promise.all([
      apiJson("/api/admin/categories"),
      apiJson("/api/admin/subcategories?limit=100&page=1"),
      apiJson("/api/admin/brands"),
      apiJson("/api/admin/models"),
    ]);
    setMeta({
      categories: c.categories ?? [],
      subcategories: s.subcategories ?? [],
      brands: b.brands ?? [],
      models: m.models ?? [],
    });
  }, []);

  useEffect(() => {
    loadMeta()
      .catch((e) => setMetaErr(e.body?.error || e.message))
      .finally(() => setMetaReady(true));
  }, [loadMeta]);

  const handleQuickCreateSuccess = useCallback(
    async (payload) => {
      const { type, id, category_id: subCatParentId, brand_id: modelBrandId } = payload;
      await loadMeta();
      const sid = String(id);
      if (type === "category") {
        setField("category_id", sid);
      } else if (type === "brand") {
        setField("brand_id", sid);
      } else if (type === "subcategory") {
        setForm((f) => ({
          ...f,
          ...(subCatParentId != null && Number(subCatParentId) > 0 ? { category_id: String(subCatParentId) } : {}),
          subcategory_id: sid,
        }));
      } else if (type === "model") {
        if (compatModelsMode) {
          setForm((f) => ({
            ...f,
            compatible_model_ids: [...new Set([...(f.compatible_model_ids || []).map(String), sid])],
          }));
        } else {
          setForm((f) => ({
            ...f,
            ...(modelBrandId != null && Number(modelBrandId) > 0 ? { brand_id: String(modelBrandId) } : {}),
            model_id: sid,
          }));
        }
      }
    },
    [loadMeta, compatModelsMode]
  );

  useEffect(() => {
    if (!canPickShop) {
      setShops([]);
      return;
    }
    apiJson("/api/admin/stores/active-list")
      .then((d) => {
        const list = d.stores ?? [];
        if (catalogScope?.can_filter_all_shops) {
          setShops(list);
          return;
        }
        const allow = new Set((catalogShopIds ?? []).map(Number));
        setShops(list.filter((s) => allow.has(Number(s.id))));
      })
      .catch(() => setShops([]));
  }, [canPickShop, catalogScope?.can_filter_all_shops, catalogShopIdsKey]);

  /**
   * Edit → Create can reuse this route component instance; the load effect only skips fetching on create
   * and does not clear prior edit state. Reset whenever the create URL is entered.
   */
  useEffect(() => {
    if (!/\/admin\/products\/create\/?$/.test(location.pathname)) return;
    setForm(initialProductForm());
    setVariants([emptyVariant()]);
    setVariantDiscountAmountDraft({});
    setGalleryPreview([]);
    setErr(null);
    setLoadErr(null);
    setImageUploadMsg(null);
    setImageUploadErr(null);
    setLabelQtyByVariant({});
    setLabelOddSlotByVariant({});
    setCompatModelsMode(false);
    setQuickAdd(null);
    setDetailLoading(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isCreate) {
      setDetailLoading(false);
      setLoadErr(null);
      return;
    }
    setDetailLoading(true);
    setLoadErr(null);
    apiJson(`/api/admin/products/${encodeURIComponent(id)}`)
      .then((d) => {
        applyLoadedProduct(d.product);
      })
      .catch((e) => setLoadErr(e.body?.error || e.message))
      .finally(() => setDetailLoading(false));
  }, [id, isCreate]);

  useEffect(
    () => () => {
      if (pendingImageUpload?.preview_url) {
        URL.revokeObjectURL(pendingImageUpload.preview_url);
      }
    },
    [pendingImageUpload?.preview_url]
  );

  useEffect(() => {
    if (isCreate) return;
    apiJson("/api/admin/print/printer-preference")
      .then((d) => {
        setPrinterName(d.printer_name ?? "");
      })
      .catch(() => {
        /* ignore */
      });
  }, [isCreate]);

  useEffect(() => {
    if (isCreate) return;
    connectJspm()
      .then(() => {
        setJspmReady(true);
        return getInstalledPrinters();
      })
      .then((list) => setInstalledPrinters(list))
      .catch(() => {
        setJspmReady(false);
        setInstalledPrinters([]);
      });
  }, [isCreate]);

  const subsForCategory = useMemo(() => {
    const cid = Number(form.category_id);
    if (!Number.isFinite(cid)) return [];
    return meta.subcategories.filter((s) => Number(s.category_id) === cid);
  }, [meta.subcategories, form.category_id]);

  const modelsForBrand = useMemo(() => {
    const bid = Number(form.brand_id);
    if (!Number.isFinite(bid)) return [];
    return meta.models.filter((m) => Number(m.brand_id) === bid);
  }, [meta.models, form.brand_id]);

  const brandNameById = useMemo(
    () => new Map((meta.brands || []).map((b) => [Number(b.id), String(b.name ?? "").trim()])),
    [meta.brands]
  );
  const compatibilityModels = useMemo(() => {
    return [...meta.models]
      .map((m) => ({
        ...m,
        brand_name: brandNameById.get(Number(m.brand_id)) || "Other",
      }))
      .sort((a, b) => {
        if (a.brand_name !== b.brand_name) return a.brand_name.localeCompare(b.brand_name);
        return String(a.name ?? "").localeCompare(String(b.name ?? ""));
      });
  }, [meta.models, brandNameById]);
  const selectedCompatSet = useMemo(
    () => new Set((Array.isArray(form.compatible_model_ids) ? form.compatible_model_ids : []).map(String)),
    [form.compatible_model_ids]
  );
  const compatibilityBrandOptions = useMemo(() => {
    const counts = new Map();
    for (const row of compatibilityModels) {
      counts.set(row.brand_name, (counts.get(row.brand_name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [compatibilityModels]);
  const visibleCompatibilityModels = useMemo(() => {
    const q = compatQuery.trim().toLowerCase();
    return compatibilityModels.filter((row) => {
      if (compatBrandFilter !== "all" && row.brand_name !== compatBrandFilter) return false;
      if (!q) return true;
      return (
        String(row.name ?? "").toLowerCase().includes(q) ||
        String(row.brand_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [compatibilityModels, compatBrandFilter, compatQuery]);
  const selectedCompatibilityModels = useMemo(
    () => compatibilityModels.filter((row) => selectedCompatSet.has(String(row.id))),
    [compatibilityModels, selectedCompatSet]
  );

  function setField(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "category_id") {
        next.subcategory_id = "";
      }
      if (field === "brand_id") {
        next.model_id = "";
      }
      return next;
    });
  }

  function setCompatibleModelIds(values) {
    setForm((f) => ({ ...f, compatible_model_ids: values }));
  }

  function toggleCompatibleModel(modelId) {
    const key = String(modelId);
    const next = new Set(selectedCompatSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompatibleModelIds([...next]);
  }

  function clearCompatibleModels() {
    setCompatibleModelIds([]);
  }

  function addVisibleCompatibleModels() {
    const next = new Set(selectedCompatSet);
    for (const row of visibleCompatibilityModels) next.add(String(row.id));
    setCompatibleModelIds([...next]);
  }

  function setVariant(i, patch) {
    setVariants((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((list) => [...list, emptyVariant()]);
  }

  function removeVariant(i) {
    setVariants((list) => (list.length <= 1 ? list : list.filter((_, j) => j !== i)));
  }

  async function refreshProductGallery() {
    if (isCreate || !id) return;
    setImageUploadErr(null);
    try {
      const d = await apiJson(`/api/admin/products/${encodeURIComponent(id)}`);
      replaceGalleryPreviewFromProduct(d.product);
    } catch (e) {
      setImageUploadErr(e.body?.error || e.message);
    }
  }

  async function handleGalleryFiles(e) {
    const files = e.target.files;
    if (!files?.length || isCreate || !id) return;
    queueImageUpload(files, { mode: "gallery" });
    e.target.value = "";
  }

  async function handleVariantImageFile(variantIdx, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const variantName = String(variants[variantIdx]?.variant_name ?? "").trim();
    if (!variantName) {
      setImageUploadErr("Enter a variant name, then choose an image file.");
      e.target.value = "";
      return;
    }
    queueImageUpload([file], { mode: "variant", variantIdx });
    e.target.value = "";
  }

  async function confirmPendingImageUpload() {
    const pending = pendingImageUpload;
    if (!pending) return;
    setImageUploadBusy(true);
    setImageUploadErr(null);
    setImageUploadMsg(null);
    try {
      if (pending.mode === "gallery") {
        if (isCreate || !id) {
          setImageUploadErr("Save the product first, then upload gallery images.");
          return;
        }
        const res = await apiUploadProductImages(Number(id), pending.files, {});
        const n = (Array.isArray(res.urls) && res.urls.length) || pending.files.length;
        const refreshed = await apiJson(`/api/admin/products/${encodeURIComponent(id)}`);
        replaceGalleryPreviewFromProduct(refreshed.product);
        setImageUploadMsg(`Uploaded ${n} image(s).`);
        closePendingImageUpload();
        return;
      }

      const variantIdx = Number(pending.variant_idx);
      const file = pending.files?.[0];
      if (!Number.isFinite(variantIdx) || !file) return;
      const variantName = String(
        pending.variant_name ?? variants[variantIdx]?.variant_name ?? ""
      ).trim();
      if (!variantName) {
        setImageUploadErr("Enter a variant name, then confirm upload.");
        return;
      }

      const existingPid = id != null && String(id).trim() !== "" ? Number(id) : NaN;
      const hasProductId = Number.isFinite(existingPid) && existingPid > 0;
      let productId = hasProductId ? existingPid : null;
      let savedProduct = null;

      if (!hasProductId) {
        const payload = buildPayload();
        const r = await apiJson("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        productId = Number(r.id);
        if (!Number.isFinite(productId) || productId <= 0) {
          throw new Error("Create failed — no product id.");
        }
        navigate(`/admin/products/${productId}/edit`, { replace: true });
        const detail = await apiJson(`/api/admin/products/${encodeURIComponent(productId)}`);
        savedProduct = detail.product;
        applyLoadedProduct(detail.product);
      }

      let variantId =
        pending.variant_id != null && Number.isFinite(Number(pending.variant_id)) && Number(pending.variant_id) > 0
          ? Number(pending.variant_id)
          : variants[variantIdx]?.id != null && variants[variantIdx].id !== ""
            ? Number(variants[variantIdx].id)
            : null;
      if (variantId == null || Number.isNaN(variantId) || variantId <= 0) {
        if (!savedProduct) {
          const payload = buildPayload();
          const resp = await apiJson(`/api/admin/products/${encodeURIComponent(productId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          if (!resp?.product) {
            throw new Error("Save failed — cannot upload variant image yet.");
          }
          savedProduct = resp.product;
        }
        variantId = resolveVariantIdFromSavedProduct(
          savedProduct,
          Array.isArray(pending.variants_snapshot) ? pending.variants_snapshot : variants,
          variantIdx,
          variantName
        );
      }

      if (variantId == null || Number.isNaN(variantId) || variantId <= 0) {
        setImageUploadErr(
          'Could not resolve this variant after save. Click “Refresh gallery” or save again, then retry.'
        );
        return;
      }
      const up = await apiUploadProductImages(Number(productId), [file], { variantId });
      const uploadedUrl = Array.isArray(up?.urls) ? up.urls[0] : null;
      setVariant(variantIdx, {
        id: variantId,
        image_path: uploadedUrl || variants[variantIdx]?.image_path || "",
      });
      const refreshed = await apiJson(`/api/admin/products/${encodeURIComponent(productId)}`);
      replaceGalleryPreviewFromProduct(refreshed.product);
      setImageUploadMsg("Variant image uploaded.");
      closePendingImageUpload();
    } catch (err) {
      const b = err.body;
      setImageUploadErr(
        (b?.field ? `${b.error}: ${b.field}` : null) ||
          b?.message ||
          (b?.error === "cloudinary_not_configured"
            ? "Cloudinary is not configured on the API."
            : b?.error || err.message)
      );
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function deleteProductImageRow(imageId) {
    if (isCreate || !id) return;
    const ok = await askDelete({
      title: "Remove this image?",
      description:
        "It will be removed from the catalog record (gallery or variant upload).\n\nThis cannot be undone.",
    });
    if (!ok) return;
    setImageUploadBusy(true);
    setImageUploadErr(null);
    setImageUploadMsg(null);
    try {
      const res = await apiJson(`/api/admin/products/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, {
        method: "DELETE",
        body: "{}",
      });
      if (res?.product) applyLoadedProduct(res.product);
      setImageUploadMsg("Image removed.");
    } catch (e) {
      setImageUploadErr(e.body?.error || e.body?.message || e.message);
    } finally {
      setImageUploadBusy(false);
    }
  }

  async function clearVariantImageCompletely(variantIdx) {
    const row = variants[variantIdx];
    const vid = row?.id != null && row.id !== "" ? Number(row.id) : NaN;
    const hasServerVariant = Number.isFinite(vid) && vid > 0 && !isCreate && id;
    const hasLocalOnly = String(row?.image_path ?? "").trim() && !hasServerVariant;

    if (hasLocalOnly) {
      setVariant(variantIdx, { image_path: "" });
      setImageUploadMsg("Image URL cleared (save to persist).");
      return;
    }
    if (!hasServerVariant) return;
    const vn = String(row.variant_name ?? "").trim() || "Unnamed";
    const ok = await askDelete({
      title: "Clear variant images?",
      description: `Remove all uploaded files and the image URL for variant “${vn}” on the server.\n\nThis cannot be undone.`,
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    setImageUploadBusy(true);
    setImageUploadErr(null);
    setImageUploadMsg(null);
    try {
      const res = await apiJson(
        `/api/admin/products/${encodeURIComponent(id)}/variants/${encodeURIComponent(vid)}/image`,
        { method: "DELETE", body: "{}" }
      );
      if (res?.product) applyLoadedProduct(res.product);
      setImageUploadMsg("Variant image cleared.");
    } catch (e) {
      setImageUploadErr(e.body?.error || e.body?.message || e.message);
    } finally {
      setImageUploadBusy(false);
    }
  }

  function buildPayload() {
    const category_id = Number(form.category_id);
    const namedVariantRows = variants.filter((v) => String(v.variant_name ?? "").trim());
    const lockProductStock = namedVariantRows.length > 0;
    const singleVariantRow = variants[0] ?? emptyVariant();
    const refVariant = namedVariantRows[0];
    const mrps = namedVariantRows.map((v) => Number(v.price) || 0);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description,
      auto_variant_barcodes: autoVariantBarcodes,
      generate_missing_barcodes: generateMissingBarcodes,
      category_id,
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      brand_id: form.brand_id ? Number(form.brand_id) : null,
      model_id: compatModelsMode ? null : form.model_id ? Number(form.model_id) : null,
      compatible_model_ids: compatModelsMode
        ? (Array.isArray(form.compatible_model_ids) ? form.compatible_model_ids : [])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [],
      sku: form.sku.trim() || null,
      price: lockProductStock
        ? mrps.length
          ? Math.min(...mrps)
          : 0
        : Number(singleVariantRow.price),
      sale_price: lockProductStock
        ? namedVariantRows.length === 1 && refVariant?.sale_price !== ""
          ? Number(refVariant.sale_price)
          : null
        : singleVariantRow.sale_price === ""
          ? null
          : Number(singleVariantRow.sale_price),
      cost_price: lockProductStock
        ? namedVariantRows.length === 1 && refVariant?.cost_price !== ""
          ? Number(refVariant.cost_price)
          : null
        : singleVariantRow.cost_price === ""
          ? null
          : Number(singleVariantRow.cost_price),
      is_active: form.is_active,
      is_featured: form.is_featured,
      meta_title: form.meta_title.trim(),
      meta_description: form.meta_description.trim(),
      gst_percent: lockProductStock
        ? Math.max(0, Number(refVariant?.gst_percent) || 0)
        : Math.max(0, Number(singleVariantRow.gst_percent) || 0),
      max_discount_percent: lockProductStock
        ? refVariant?.max_discount_percent === "" || refVariant?.max_discount_percent == null
          ? null
          : (() => {
              const n = Number(refVariant.max_discount_percent);
              return Number.isFinite(n) ? n : null;
            })()
        : singleVariantRow.max_discount_percent === "" || singleVariantRow.max_discount_percent == null
          ? null
          : (() => {
              const n = Number(singleVariantRow.max_discount_percent);
              return Number.isFinite(n) ? n : null;
            })(),
      hsn_code: form.hsn_code.trim() ? form.hsn_code.trim().slice(0, 20) : null,
      no_store_stock: !!form.no_store_stock,
      variants: variants
        .filter((v) => v.variant_name.trim())
        .map((v) => ({
          id: v.id,
          variant_name: v.variant_name.trim(),
          sku: v.sku.trim() || null,
          attribute_name: v.attribute_name.trim() || null,
          attribute_value: v.attribute_value.trim() || null,
          barcode: v.barcode.trim() || null,
          quantity: v.quantity === "" ? null : Number(v.quantity),
          image_path: v.image_path.trim() || null,
          is_active: v.is_active,
          price: Number(v.price),
          sale_price: v.sale_price === "" ? null : Number(v.sale_price),
          cost_price: v.cost_price === "" ? null : Number(v.cost_price),
          gst_percent: Math.max(0, Number(v.gst_percent) || 0),
          max_discount_percent:
            v.max_discount_percent === "" || v.max_discount_percent == null
              ? null
              : (() => {
                  const n = Number(v.max_discount_percent);
                  return Number.isFinite(n) ? n : null;
                })(),
        })),
    };
    if (canPickShop) {
      payload.shop_id = form.shop_id === "" ? null : Number(form.shop_id);
    }
    if (!lockProductStock) {
      payload.stock_quantity = Number(singleVariantRow.quantity) || 0;
    }
    return payload;
  }

  function resetAfterCreateAnother() {
    setForm(initialProductForm());
    setVariants([emptyVariant()]);
    setVariantDiscountAmountDraft({});
    setGalleryPreview([]);
    setErr(null);
    setImageUploadMsg(null);
    setImageUploadErr(null);
    setLabelQtyByVariant({});
    setLabelOddSlotByVariant({});
    setCompatModelsMode(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function persist(options = {}) {
    const { stayOnEdit = false, saveAndNew = false } = options;
    setErr(null);
    const categoryCheck = Number(form.category_id);
    if (!Number.isFinite(categoryCheck) || categoryCheck <= 0) {
      setErr("Please choose a category.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isCreate) {
        const r = await apiJson("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (saveAndNew) {
          resetAfterCreateAnother();
        } else {
          navigate(`/admin/products/${r.id}/edit`, { replace: true });
        }
      } else {
        const resp = await apiJson(`/api/admin/products/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (resp?.product) {
          applyLoadedProduct(resp.product);
        }
        if (!stayOnEdit) {
          navigate("/admin/products");
        }
      }
    } catch (e) {
      const b = e.body;
      setErr(
        b?.field
          ? `${b.error}: ${b.field}`
          : b?.barcode
            ? `${b.error} (${b.barcode})`
            : b?.error || b?.message || e.message
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct() {
    const label = form.name.trim() || "this product";
    const ok = await askDelete({
      title: "Delete this product?",
      description: `Permanently remove “${label}” and all variants and linked image records.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    setErr(null);
    try {
      await apiJson(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
      navigate("/admin/products");
    } catch (e) {
      const b = e.body;
      if (b?.error === "product_in_use") {
        setErr(
          `In use: orders ${b.blockers?.orders ?? 0}, cart ${b.blockers?.cart ?? 0}, wishlist ${b.blockers?.wishlist ?? 0}, reviews ${b.blockers?.reviews ?? 0}.`
        );
      } else {
        setErr(b?.error || e.message);
      }
    }
  }

  async function downloadTspl(variantIdx) {
    setErr(null);
    if (!id) {
      setErr("Save the product first, then download TSPL for labels.");
      return;
    }
    const row = variants[variantIdx];
    const q = Math.min(999, Math.max(1, Number(labelQtyByVariant[variantIdx]) || 2));
    const odd = labelOddSlotByVariant[variantIdx] === "right" ? "right" : "left";
    let path = `/api/admin/print/tspl?productId=${encodeURIComponent(id)}&quantity=${q}&layout=two_up_72x25&remainder_side=${encodeURIComponent(odd)}`;
    if (row?.id != null) path += `&variantId=${encodeURIComponent(row.id)}`;
    try {
      const data = await apiJson(path);
      const blob = new Blob([data.tspl], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const vf = row?.id != null ? `-${row.id}` : "";
      a.download = `label-${id}${vf}.tspl`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      const b = e.body;
      setErr(b?.message || b?.error || e.message);
    }
  }

  async function sendTsplViaJspm(variantIdx) {
    setErr(null);
    if (!id) {
      setErr("Save the product first, then print labels.");
      return;
    }
    if (!printerName.trim()) {
      setErr("Select an installed printer first.");
      return;
    }
    const row = variants[variantIdx];
    const q = Math.min(999, Math.max(1, Number(labelQtyByVariant[variantIdx]) || 2));
    const odd = labelOddSlotByVariant[variantIdx] === "right" ? "right" : "left";
    let path = `/api/admin/print/tspl?productId=${encodeURIComponent(id)}&quantity=${q}&layout=two_up_72x25&remainder_side=${encodeURIComponent(odd)}`;
    if (row?.id != null) path += `&variantId=${encodeURIComponent(row.id)}`;
    try {
      const data = await apiJson(path);
      await sendTsplToInstalledPrinter(printerName, data.tspl);
      if (printerName.trim()) {
        await apiJson("/api/admin/print/printer-preference", {
          method: "POST",
          body: JSON.stringify({ printer_name: printerName.trim() }),
        });
      }
      window.alert(`TSPL sent to ${printerName}`);
    } catch (e) {
      const b = e.body;
      setErr(b?.message || b?.error || e.message);
    }
  }

  const namedVariantRows = variants.filter((v) => String(v.variant_name ?? "").trim());
  const lockProductStock = namedVariantRows.length > 0;

  const galleryOnlyImages = useMemo(
    () =>
      galleryPreview.filter((im) => {
        const vid = im.variant_id;
        return vid == null || vid === "" || Number(vid) <= 0;
      }),
    [galleryPreview]
  );

  const inp =
    "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15";
  const lbl = "block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  if (metaErr) return <p className="text-red-600">{metaErr}</p>;
  if (!metaReady) return <p className="text-gray-600">Loading catalog…</p>;
  if (loadErr) return <p className="text-red-600">{loadErr}</p>;
  if (detailLoading) return <p className="text-gray-600">Loading product…</p>;

  return (
    <section className="min-h-[calc(100vh-48px)] bg-[radial-gradient(circle_at_top,#f9fafb_0%,#e5e7eb_40%,#f3f4f6_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <Link
              to="/admin/products"
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
            >
              ← Products
            </Link>
            <p className={lbl}>Admin / Catalog</p>
            <h1 className="text-2xl font-black tracking-wide text-slate-900 md:text-3xl">
              {isCreate ? "Add product" : "Edit product"}
            </h1>
            {!isCreate && form.name ? <p className="text-sm font-medium text-slate-600">Editing: {form.name}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {form.slug.trim() ? (
              <Link
                to={`/product/${encodeURIComponent(form.slug.trim())}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
              >
                Preview storefront
              </Link>
            ) : null}
          </div>
        </header>

        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            persist(isCreate ? {} : { stayOnEdit: true });
          }}
          className="space-y-6"
        >
          <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <label className="block md:col-span-1">
                <span className={lbl}>Name *</span>
                <input className={inp} value={form.name} onChange={(e) => setField("name", e.target.value)} required />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={lbl}>Category *</span>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-semibold text-sky-700 hover:underline"
                    onClick={() => setQuickAdd("category")}
                  >
                    + New category
                  </button>
                </div>
                <SearchableSelect
                  value={form.category_id}
                  onChange={(v) => setField("category_id", v)}
                  options={meta.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
                  placeholder="Search categories…"
                  emptyLabel="— Choose —"
                  aria-label="Category"
                />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={lbl}>Brand</span>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-semibold text-sky-700 hover:underline"
                    onClick={() => setQuickAdd("brand")}
                  >
                    + New brand
                  </button>
                </div>
                <SearchableSelect
                  value={form.brand_id}
                  onChange={(v) => setField("brand_id", v)}
                  options={meta.brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
                  placeholder="Search brands…"
                  emptyLabel="— None —"
                  aria-label="Brand"
                />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={lbl}>Subcategory</span>
                  <button
                    type="button"
                    disabled={!form.category_id}
                    title={!form.category_id ? "Choose a category first" : undefined}
                    className="shrink-0 text-[11px] font-semibold text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                    onClick={() => setQuickAdd("subcategory")}
                  >
                    + New subcategory
                  </button>
                </div>
                <SearchableSelect
                  value={form.subcategory_id}
                  onChange={(v) => setField("subcategory_id", v)}
                  options={subsForCategory.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
                  placeholder="Search subcategories…"
                  emptyLabel="— None —"
                  disabled={!form.category_id}
                  aria-label="Subcategory"
                />
              </label>

              <div className={compatModelsMode ? "block md:col-span-4" : "block md:col-span-2"}>
                {!compatModelsMode ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={lbl}>Model</span>
                      <button
                        type="button"
                        disabled={!form.brand_id}
                        title={!form.brand_id ? "Choose a brand first (or pick brand in the modal)" : undefined}
                        className="text-[11px] font-semibold text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                        onClick={() => setQuickAdd("model")}
                      >
                        + New model
                      </button>
                      <div
                        className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
                        role="group"
                        aria-label="Model assignment mode"
                      >
                        <button
                          type="button"
                          onClick={() => setCompatModelsMode(false)}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                            !compatModelsMode
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Single model
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompatModelsMode(true)}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                            compatModelsMode
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Compatible models
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500">One primary model for this product.</span>
                    </div>
                    <label className="block">
                      <span className="sr-only">Model</span>
                      <SearchableSelect
                        value={form.model_id}
                        onChange={(v) => setField("model_id", v)}
                        options={modelsForBrand.map((m) => ({ id: m.id, name: m.name, slug: m.slug }))}
                        placeholder="Search models…"
                        emptyLabel="— None —"
                        disabled={!form.brand_id}
                        aria-label="Model"
                      />
                    </label>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
                      <span className={lbl}>Compatible models</span>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-sky-700 hover:underline"
                        onClick={() => setQuickAdd("model")}
                      >
                        + New model
                      </button>
                      <div
                        className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
                        role="group"
                        aria-label="Model assignment mode"
                      >
                        <button
                          type="button"
                          onClick={() => setCompatModelsMode(false)}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                            !compatModelsMode
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Single model
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompatModelsMode(true)}
                          className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                            compatModelsMode
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Compatible models
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Pick many devices (e.g. one glass fits many phones).
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bulk actions</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={addVisibleCompatibleModels}
                        >
                          Add filtered
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={clearCompatibleModels}
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="md:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Search model</span>
                    <input
                      className={`${inp} mt-0.5`}
                      placeholder="Type model or brand"
                      value={compatQuery}
                      onChange={(e) => setCompatQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Brand filter</span>
                    <select
                      className={`${inp} mt-0.5`}
                      value={compatBrandFilter}
                      onChange={(e) => setCompatBrandFilter(e.target.value)}
                    >
                      <option value="all">All brands</option>
                      {compatibilityBrandOptions.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} ({b.count})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {visibleCompatibilityModels.map((m) => {
                      const checked = selectedCompatSet.has(String(m.id));
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleCompatibleModel(m.id)}
                          className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs ${
                            checked
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-semibold">{m.brand_name}</span> · {m.name}
                          </span>
                          <span className="text-[11px]">{checked ? "Selected" : "Add"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {visibleCompatibilityModels.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-slate-500">No models match the current filters.</p>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedCompatibilityModels.slice(0, 18).map((m) => (
                    <button
                      key={`selected-${m.id}`}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                      onClick={() => toggleCompatibleModel(m.id)}
                      title="Remove"
                    >
                      {m.brand_name}: {m.name} ×
                    </button>
                  ))}
                  {selectedCompatibilityModels.length > 18 ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      +{selectedCompatibilityModels.length - 18} more
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  User-friendly compatibility picker for tempered glass/cases across many brands and models.
                </p>
                  </div>
                )}
              </div>

              {canPickShop ? (
                <label className="block md:col-span-2">
                  <span className={lbl}>Shop</span>
                  <select className={inp} value={form.shop_id} onChange={(e) => setField("shop_id", e.target.value)}>
                    <option value="">— No shop on product —</option>
                    {shops.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.code ? ` (${s.code})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500 leading-snug">
                    Link a product to a shop so staff assigned to that shop see it in their catalog. Leave empty only when
                    the product is shared or managed centrally.
                  </p>
                </label>
              ) : enforcedShopLabel ? (
                <div className="block md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                  <span className={lbl}>Shop</span>
                  <p className="text-sm font-semibold text-slate-900">{enforcedShopLabel}</p>
                  <p className="mt-1 text-[10px] text-slate-500 leading-snug">
                    Saves stay on this shop only — no store picker. An admin adds “Products — all shops (catalog)” on your
                    role if you should assign products to Shop 1, Shop 2, etc.
                  </p>
                </div>
              ) : null}

              <div className="md:col-span-4 rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold text-amber-900">Pricing lives in Variants</p>
                <p className="mt-1 text-xs text-amber-900/85 leading-snug">
                  Keep MRP, sale price, discount, GST, cost, and stock inside the <strong>Variants</strong> section
                  below. Use the first row for a single product, or add named rows for multi-option products.{" "}
                  <strong>Product SKU</strong> stays here.
                </p>
              </div>
              <label className="block">
                <span className={lbl}>Product SKU</span>
                <input className={inp} value={form.sku} onChange={(e) => setField("sku", e.target.value)} />
              </label>
              <label className="block">
                <span className={lbl}>HSN code</span>
                <input
                  className={inp}
                  maxLength={20}
                  value={form.hsn_code}
                  onChange={(e) => setField("hsn_code", e.target.value)}
                  placeholder="e.g. 4202"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-6 border-t border-slate-100 pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.no_store_stock}
                  onChange={(e) => setField("no_store_stock", e.target.checked)}
                />
                No store stock
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
                Active
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setField("is_featured", e.target.checked)} />
                Featured
              </label>
            </div>

            <label className="block">
              <span className={lbl}>Slug (optional)</span>
              <input
                className={inp}
                value={form.slug}
                onChange={(e) => setField("slug", e.target.value)}
                placeholder="Auto from name on create"
              />
            </label>

            <label className="block">
              <span className={lbl}>Description</span>
              <textarea
                className={`${inp} min-h-[96px]`}
                rows={4}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </label>
          </div>

        {!isCreate ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Gallery images</h2>
            <p className="text-xs text-gray-500">
              Product-wide photos only (variant uploads are managed under each variant below). Uploads go to Cloudinary;
              thumbnails refresh after each change.
            </p>
            {galleryOnlyImages.length > 0 ? (
              <ul className="flex flex-wrap gap-3">
                {galleryOnlyImages.map((im) => (
                  <li
                    key={im.id ?? im.image_path}
                    className="relative w-20 h-20 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                  >
                    {im.image_path ? (
                      <img src={im.image_path} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {im.id != null && !isCreate && id ? (
                      <button
                        type="button"
                        title="Remove from gallery"
                        disabled={imageUploadBusy}
                        className="absolute right-0 top-0 rounded-bl bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
                        onClick={() => deleteProductImageRow(im.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No product gallery images yet.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-700">
                <span className="font-semibold block mb-1">Add gallery files</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={imageUploadBusy}
                  className="text-sm max-w-full"
                  onChange={(e) => handleGalleryFiles(e)}
                />
              </label>
              <button
                type="button"
                disabled={imageUploadBusy}
                className="text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => refreshProductGallery()}
              >
                Refresh images
              </button>
            </div>
            {imageUploadMsg ? <p className="text-sm text-gray-700">{imageUploadMsg}</p> : null}
            {imageUploadErr ? <p className="text-sm text-red-600">{imageUploadErr}</p> : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">SEO</h2>
          <label className="block">
            <span className={lbl}>Meta title</span>
            <input className={inp} value={form.meta_title} onChange={(e) => setField("meta_title", e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>Meta description</span>
            <textarea className={inp} rows={2} value={form.meta_description} onChange={(e) => setField("meta_description", e.target.value)} />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Variants</h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-500">
                Use the first row below for single-product pricing and stock. Add a variant name only for real options
                like size, color, or storage. Variant image files are stored separately from the product gallery
                (tagged to this variant).
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              onClick={addVariant}
            >
              + Add variant
            </button>
          </div>
          {isCreate ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoVariantBarcodes}
                onChange={(e) => setAutoVariantBarcodes(e.target.checked)}
              />
              <span>Auto-assign retail barcodes for new variants (Code 128 / TSPL labels)</span>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={generateMissingBarcodes}
                onChange={(e) => setGenerateMissingBarcodes(e.target.checked)}
              />
              <span>On save, generate barcodes only where missing (existing codes unchanged)</span>
            </label>
          )}
          {variants.map((v, i) => {
            const labelQty = Math.min(999, Math.max(1, Number(labelQtyByVariant[i]) || 2));
            const oddSlot = labelOddSlotByVariant[i] === "right" ? "right" : "left";
            const vidNum = v.id != null && v.id !== "" ? Number(v.id) : NaN;
            const variantUploadRows =
              Number.isFinite(vidNum) && vidNum > 0
                ? galleryPreview.filter((im) => Number(im.variant_id) === vidNum)
                : [];
            const hasVariantImage =
              variantUploadRows.length > 0 || String(v.image_path ?? "").trim().length > 0;
            const hasVariantName = String(v.variant_name ?? "").trim().length > 0;
            const isSingleProductRow = !lockProductStock && i === 0;
            const showVariantPricing = hasVariantName || isSingleProductRow;
            return (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Variant {i + 1}</span>
                  {variants.length > 1 ? (
                    <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => removeVariant(i)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  className={inp}
                  placeholder={isSingleProductRow ? "Leave blank for single product, or enter a real variant name" : "Variant name (e.g. Red, 128GB Black)"}
                  value={v.variant_name}
                  onChange={(e) => setVariant(i, { variant_name: e.target.value })}
                />
                {isSingleProductRow ? (
                  <p className="text-[11px] text-slate-500">
                    Keep this name empty for a single product. Fill it only when the product truly has options.
                  </p>
                ) : null}
                {showVariantPricing ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {hasVariantName ? "Pricing (this variant)" : "Pricing (single product)"}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="block">
                        <span className={lbl}>MRP *</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inp}
                          required
                          value={v.price}
                          onChange={(e) => setVariant(i, { price: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className={lbl}>Sale price</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inp}
                          value={v.sale_price}
                          onChange={(e) => setVariant(i, { sale_price: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className={lbl}>Max discount %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className={inp}
                          value={v.max_discount_percent}
                          onChange={(e) => {
                            const pct = e.target.value;
                            setVariant(i, { max_discount_percent: pct });
                            const base = baseSellingPrice(v.price, v.sale_price);
                            const p = parseFloat(pct);
                            if (base > 0 && Number.isFinite(p) && p >= 0) {
                              setVariantDiscountAmountDraft((m) => ({ ...m, [i]: ((base * p) / 100).toFixed(2) }));
                            }
                          }}
                          placeholder="e.g. 10"
                        />
                      </label>
                      <label className="block">
                        <span className={lbl}>Max discount ₹ (helper)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inp}
                          value={variantDiscountAmountDraft[i] ?? ""}
                          onChange={(e) =>
                            setVariantDiscountAmountDraft((m) => ({
                              ...m,
                              [i]: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const d = String(variantDiscountAmountDraft[i] ?? "").trim();
                            if (!d) return;
                            const base = baseSellingPrice(v.price, v.sale_price);
                            const amount = parseFloat(d);
                            if (base <= 0 || !Number.isFinite(amount) || amount <= 0) return;
                            const pct = Math.max(0, Math.min(100, (amount / base) * 100)).toFixed(2);
                            setVariant(i, { max_discount_percent: pct });
                          }}
                          placeholder="Syncs % from MRP / sale"
                        />
                      </label>
                      <label className="block">
                        <span className={lbl}>GST %</span>
                        <input
                          type="number"
                          min={0}
                          max={28}
                          step="0.01"
                          className={inp}
                          value={v.gst_percent}
                          onChange={(e) => setVariant(i, { gst_percent: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className={lbl}>Cost price</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inp}
                          value={v.cost_price}
                          onChange={(e) => setVariant(i, { cost_price: e.target.value })}
                        />
                      </label>
                    </div>
                    {(() => {
                      const vp = variantProfitPreview(v);
                      return vp ? (
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-900">
                          <span className="font-semibold uppercase tracking-wide">Profit preview</span>
                          <span className="mx-2 text-emerald-700">·</span>
                          <span>
                            Sell {fmtInr(vp.selling)}
                            {vp.usesSalePrice ? " (sale)" : " (MRP)"}
                          </span>
                          <span className="mx-2 text-emerald-700">·</span>
                          <span>Cost {vp.hasCostField ? fmtInr(vp.cost) : "—"}</span>
                          <span className="mx-2 text-emerald-700">·</span>
                          <span>
                            Gross{" "}
                            {vp.hasSelling && vp.hasCostField ? fmtInr(vp.grossPerUnit ?? 0) : "—"}
                          </span>
                          {vp.marginPct != null && vp.hasSelling && vp.hasCostField ? (
                            <>
                              <span className="mx-2 text-emerald-700">·</span>
                              <span>{vp.marginPct.toFixed(1)}% margin</span>
                            </>
                          ) : null}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : null}
                {hasVariantName ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={lbl}>Attribute (e.g. Colour)</span>
                      <input
                        className={inp}
                        placeholder="Colour"
                        value={v.attribute_name}
                        onChange={(e) => setVariant(i, { attribute_name: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className={lbl}>Attribute value</span>
                      <input
                        className={inp}
                        placeholder="Red"
                        value={v.attribute_value}
                        onChange={(e) => setVariant(i, { attribute_value: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {hasVariantName ? (
                    <label className="block">
                      <span className={lbl}>Variant SKU</span>
                      <input className={inp} placeholder="Optional" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                    </label>
                  ) : (
                    <div />
                  )}
                  <label className="block">
                    <span className={lbl}>Barcode (POS / label)</span>
                    <input
                      className={`${inp} font-mono text-xs`}
                      placeholder="Auto when enabled"
                      value={v.barcode}
                      onChange={(e) => setVariant(i, { barcode: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={lbl}>Quantity</span>
                    <input
                      type="number"
                      min={0}
                      className={inp}
                      placeholder="0"
                      value={v.quantity}
                      onChange={(e) => setVariant(i, { quantity: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={lbl}>Image URL</span>
                    <input
                      className={`${inp} font-mono text-xs`}
                      placeholder="Or upload below"
                      value={v.image_path}
                      onChange={(e) => setVariant(i, { image_path: e.target.value })}
                    />
                  </label>
                </div>
                <div className="block text-xs text-slate-600">
                  <span className="block font-medium text-slate-700">Variant image file</span>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                    Enter a variant name first. You will see preview first, then confirm upload. If this product is not saved yet,
                    it is created automatically during confirm.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={imageUploadBusy}
                      className="block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-black disabled:opacity-50"
                      aria-label={`Choose variant ${i + 1} image file`}
                      onChange={(e) => handleVariantImageFile(i, e)}
                    />
                  </div>
                  {variantUploadRows.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-900">
                        Variant uploads (separate from product gallery)
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-3">
                        {variantUploadRows.map((im) => (
                          <li
                            key={im.id ?? im.image_path}
                            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-violet-200 bg-white"
                          >
                            {im.image_path ? (
                              <img src={im.image_path} alt="" className="h-full w-full object-cover" />
                            ) : null}
                            {im.id != null && !isCreate && id ? (
                              <button
                                type="button"
                                title="Remove this file"
                                disabled={imageUploadBusy}
                                className="absolute right-0 top-0 rounded-bl bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
                                onClick={() => deleteProductImageRow(im.id)}
                              >
                                ×
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!isCreate && id && Number.isFinite(vidNum) && vidNum > 0 && hasVariantImage ? (
                      <button
                        type="button"
                        disabled={imageUploadBusy}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
                        onClick={() => clearVariantImageCompletely(i)}
                      >
                        Clear variant image
                      </button>
                    ) : null}
                    {isCreate && String(v.image_path ?? "").trim() ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setVariant(i, { image_path: "" })}
                      >
                        Clear image URL
                      </button>
                    ) : null}
                    {!isCreate && id && (!Number.isFinite(vidNum) || vidNum <= 0) && String(v.image_path ?? "").trim() ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setVariant(i, { image_path: "" })}
                      >
                        Clear image URL (save to persist)
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200/80 pt-3">
                  {String(v.image_path ?? "").trim() ? (
                    <div className="shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Image preview</p>
                      <img
                        src={String(v.image_path).trim()}
                        alt=""
                        className="mt-1 h-28 w-28 rounded-lg border border-slate-200 bg-white object-cover shadow-sm"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Barcode preview</p>
                    <div className="mt-1">
                      <VariantBarcodePreview barcode={v.barcode} />
                    </div>
                  </div>
                </div>
                {!isCreate && id ? (
                  <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">Barcode labels (TSPL)</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block">
                        <span className={lbl}>Labels</span>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          className={inp}
                          value={labelQtyByVariant[i] ?? 2}
                          onChange={(e) =>
                            setLabelQtyByVariant((prev) => ({
                              ...prev,
                              [i]: Math.min(999, Math.max(1, Number(e.target.value) || 1)),
                            }))
                          }
                        />
                      </label>
                      {labelQty % 2 === 1 ? (
                        <label className="block">
                          <span className={lbl}>Odd row slot</span>
                          <select
                            className={inp}
                            value={oddSlot}
                            onChange={(e) =>
                              setLabelOddSlotByVariant((prev) => ({ ...prev, [i]: e.target.value === "right" ? "right" : "left" }))
                            }
                          >
                            <option value="left">Left (blank right)</option>
                            <option value="right">Right (blank left)</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        onClick={() => downloadTspl(i)}
                      >
                        Download TSPL
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                        onClick={() => sendTsplViaJspm(i)}
                      >
                        Print via JSPrintManager
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Label uses product + variant name, brand + model line, variant barcode, and sale/MRP (matches PHP print page behaviour).
                    </p>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={v.is_active} onChange={(e) => setVariant(i, { is_active: e.target.checked })} />
                  Active
                </label>
              </div>
            );
          })}
        </div>

        {!isCreate ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">JSPrintManager</h2>
            <p className="text-xs text-gray-500">
              Generate TSPL then print through the JSPrintManager desktop service (v8).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Installed printer</span>
                <select className={inp} value={printerName} onChange={(e) => setPrinterName(e.target.value)}>
                  <option value="">{jspmReady ? "Select printer" : "JSPM not connected"}</option>
                  {installedPrinters.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-gray-500 flex items-end">
                {jspmReady
                  ? `Connected. ${installedPrinters.length} printer(s) detected.`
                  : "Start JSPrintManager desktop app and allow this site to print."}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 items-center border-t border-slate-200 pt-6">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? "Saving…" : isCreate ? "Create product" : "Save"}
          </button>
          {!isCreate ? (
            <button
              type="button"
              disabled={saving}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => persist({ stayOnEdit: false })}
            >
              Save &amp; exit to catalog
            </button>
          ) : null}
          {isCreate ? (
            <button
              type="button"
              disabled={saving}
              className="rounded-full border border-slate-800 bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={() => persist({ saveAndNew: true })}
            >
              Save &amp; add another
            </button>
          ) : null}
          {!isCreate ? (
            <button
              type="button"
              className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={removeProduct}
            >
              Delete product
            </button>
          ) : null}
        </div>
      </form>
      {pendingImageUpload ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Confirm image upload</h3>
            <p className="mt-1 text-sm text-slate-600">
              {pendingImageUpload.mode === "variant"
                ? "This image will be uploaded to the selected variant."
                : "This image will be uploaded to product gallery."}
            </p>
            {pendingImageUpload.preview_url ? (
              <img
                src={pendingImageUpload.preview_url}
                alt="Upload preview"
                className="mt-3 h-52 w-full rounded-xl border border-slate-200 object-cover"
              />
            ) : (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {pendingImageUpload.files[0]?.name || "Selected file"}
              </div>
            )}
            {pendingImageUpload.files.length > 1 ? (
              <p className="mt-2 text-xs text-slate-500">
                +{pendingImageUpload.files.length - 1} more file(s) selected.
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={closePendingImageUpload}
                disabled={imageUploadBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                onClick={confirmPendingImageUpload}
                disabled={imageUploadBusy}
              >
                {imageUploadBusy ? "Uploading…" : "Confirm upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CatalogQuickCreateModals
        active={quickAdd}
        onClose={() => setQuickAdd(null)}
        onSuccess={handleQuickCreateSuccess}
        categoryIdPreset={form.category_id}
        brandIdPreset={form.brand_id}
        categories={meta.categories}
        brands={meta.brands}
        inp={inp}
        lbl={lbl}
      />
      </div>
    </section>
  );
}
