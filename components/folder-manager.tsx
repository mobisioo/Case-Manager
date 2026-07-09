"use client";

import {
  FormEvent,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Video,
  Home,
  KeyRound,
  Layers3,
  LockKeyhole,
  List,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import styles from "./folder-manager.module.css";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_starred: boolean | null;
};

type BreadcrumbRow = {
  id: string;
  name: string;
};

type CaseRow = {
  id: string;
  title: string;
  label: string | null;
  details: string | null;
  case_date: string | null;
  status: string | null;
  case_date_jalali: string | null;
  folder_id: string | null;
  created_at: string;
  is_starred: boolean | null;
};

type CaseDocumentRow = {
  id: string;
  case_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

type FolderManagerProps = {
  userEmail: string;
  activeFolderId: string | null;
};

type ModalState =
  | { type: "edit"; folder: FolderRow }
  | { type: "delete"; folder: FolderRow }
  | { type: "password" }
  | { type: "case" }
  | { type: "caseCreated"; case: CaseRow }
  | { type: "caseDetails"; case: CaseRow }
  | { type: "caseEdit"; case: CaseRow }
  | { type: "caseDelete"; case: CaseRow }
  | { type: "documentRename"; document: CaseDocumentRow }
  | { type: "documentDelete"; document: CaseDocumentRow }
  | { type: "documentViewer"; document: CaseDocumentRow }
  | null;

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type ViewMode = "grid" | "list";

const MAX_FOLDER_NAME = 80;
const MAX_CASE_TITLE = 120;
const OPEN_ANIMATION_MS = 360;
const CASE_DOCUMENTS_BUCKET = "case-documents";

function normalizeFolderName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function mapSupabaseError(message?: string) {
  const text = (message ?? "").toLowerCase();

  if (text.includes("duplicate") || text.includes("unique")) {
    return "داخل این مسیر پوشه‌ای با همین نام وجود دارد.";
  }

  if (
    text.includes("row-level security") ||
    text.includes("permission denied")
  ) {
    return "دسترسی لازم برای انجام این عملیات وجود ندارد. قوانین دیتابیس را بررسی کن.";
  }

  if (text.includes("relation") && text.includes("folders")) {
    return "جدول پوشه‌ها هنوز در دیتابیس ساخته نشده است. فایل SQL پوشه‌ها را اجرا کن.";
  }

  if (text.includes("relation") && text.includes("case_documents")) {
    return "جدول مستندات پرونده هنوز در دیتابیس آماده نشده است. فایل SQL پرونده‌ها را اجرا کن.";
  }

  if (text.includes("relation") && text.includes("cases")) {
    return "جدول پرونده‌ها هنوز در دیتابیس آماده نشده است. فایل SQL پرونده‌ها را اجرا کن.";
  }

  if (text.includes("bucket") || text.includes("storage")) {
    return "فضای آپلود مستندات هنوز آماده نیست. بخش Storage فایل SQL پرونده‌ها را اجرا کن.";
  }

  if (
    text.includes("column") &&
    (text.includes("folder_id") ||
      text.includes("label") ||
      text.includes("case_date") ||
      text.includes("case_date_jalali") ||
      text.includes("is_starred"))
  ) {
    return "ستون‌های جدید پرونده‌ها هنوز در دیتابیس ساخته نشده‌اند. فایل SQL پرونده‌ها را اجرا کن.";
  }

  if (text.includes("column") && text.includes("is_starred")) {
    return "ستون ستاره‌دار هنوز در دیتابیس ساخته نشده است. فایل SQL جدید پوشه‌ها را اجرا کن.";
  }

  if (text.includes("function") && text.includes("folder_breadcrumbs")) {
    return "تابع مسیر پوشه هنوز در دیتابیس ساخته نشده است. فایل SQL پوشه‌ها را اجرا کن.";
  }

  if (text.includes("password")) {
    return "رمز عبور قابل قبول نیست. رمز قوی‌تری وارد کن.";
  }

  return "عملیات انجام نشد. چند لحظه بعد دوباره تلاش کن.";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function getTodayJalali() {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\u200e/g, "")
    .replace(/\//g, "/");
}

function normalizeJalaliDate(value: string) {
  return value.replace(/[\-.]/g, "/").replace(/\s+/g, "").trim();
}

function isValidJalaliDate(value: string) {
  const normalized = normalizeJalaliDate(value);
  return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized) || /^[۰-۹]{4}\/[۰-۹]{1,2}\/[۰-۹]{1,2}$/.test(normalized);
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "-").replace(/\s+/g, "-");
}

function isImageDocument(doc: CaseDocumentRow) {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const name = doc.file_name.toLowerCase();
  return (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
  );
}

function getFileExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toUpperCase() : "فایل";
}

export function FolderManager({
  userEmail,
  activeFolderId,
}: FolderManagerProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    activeFolderId,
  );
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [allFolders, setAllFolders] = useState<FolderRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [allCases, setAllCases] = useState<CaseRow[]>([]);
  const [caseDocuments, setCaseDocuments] = useState<CaseDocumentRow[]>([]);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const [activeCaseTab, setActiveCaseTab] = useState<"details" | "documents">("details");
  const [documentsView, setDocumentsView] = useState<"gallery" | "list">("gallery");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbRow[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [folderName, setFolderName] = useState("");
  const [editName, setEditName] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [openingFolderId, setOpeningFolderId] = useState<string | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [menuCaseId, setMenuCaseId] = useState<string | null>(null);
  const [menuDocumentId, setMenuDocumentId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseLabel, setCaseLabel] = useState("");
  const [caseDetails, setCaseDetails] = useState("");
  const [caseDate, setCaseDate] = useState("");
  const [documentEditName, setDocumentEditName] = useState("");
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerDocument, setViewerDocument] = useState<CaseDocumentRow | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("کاربر سامانه");
  const [activeAppTab, setActiveAppTab] = useState<"home" | "records" | "settings">("home");
  const [sidebarTab, setSidebarTab] = useState<"folders" | "labels">("folders");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterKind, setFilterKind] = useState<"all" | "folder" | "case">("all");
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterLabel, setFilterLabel] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentFolderName = breadcrumbs.length
    ? breadcrumbs[breadcrumbs.length - 1].name
    : "پرونده‌های عمومی";
  const searchQuery = normalizeFolderName(search).toLowerCase();
  const dashboardQuery = normalizeFolderName(dashboardSearch).toLowerCase();

  const labelOptions = useMemo(() => {
    const map = new Map<string, number>();
    allCases.forEach((item) => {
      const label = normalizeFolderName(item.label ?? "");
      if (!label) return;
      map.set(label, (map.get(label) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [allCases]);

  const folderMap = useMemo(() => new Map(allFolders.map((folder) => [folder.id, folder])), [allFolders]);

  const buildPathParts = useCallback(
    (folderId: string | null | undefined) => {
      const parts: string[] = [];
      let cursor = folderId ?? null;
      const guard = new Set<string>();

      while (cursor && folderMap.has(cursor) && !guard.has(cursor)) {
        guard.add(cursor);
        const folder = folderMap.get(cursor)!;
        parts.unshift(folder.name);
        cursor = folder.parent_id;
      }

      return ["پرونده‌های عمومی", ...parts];
    },
    [folderMap],
  );

  const currentPathText = buildPathParts(currentFolderId).join(" / ");

  function getCaseSearchText(item: CaseRow) {
    return `${item.title} ${item.label ?? ""} ${item.details ?? ""} ${item.case_date_jalali ?? ""} ${formatDate(item.case_date, item.case_date_jalali)}`.toLowerCase();
  }

  useEffect(() => {
    setCurrentFolderId(activeFolderId);
  }, [activeFolderId]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (error) showToast("error", error);
  }, [error, showToast]);

  useEffect(() => {
    if (success) showToast("success", success);
  }, [success, showToast]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const metadataName =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : "";

      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      const profileName =
        typeof data?.full_name === "string" ? data.full_name : "";
      const profileUsername =
        typeof data?.username === "string" ? data.username : "";
      setUserDisplayName(
        profileName ||
          metadataName ||
          profileUsername ||
          userEmail ||
          "کاربر سامانه",
      );
    }

    void loadProfile();
  }, [supabase, userEmail]);

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    allFolders.forEach((folder) => {
      if (!folder.parent_id) return;
      map.set(folder.parent_id, (map.get(folder.parent_id) ?? 0) + 1);
    });
    return map;
  }, [allFolders]);

  const rootFolders = useMemo(
    () => allFolders.filter((folder) => folder.parent_id === null),
    [allFolders],
  );
  const starredFolders = useMemo(
    () => allFolders.filter((folder) => Boolean(folder.is_starred)),
    [allFolders],
  );

  const visibleFolders = useMemo(() => {
    if (filterKind === "case") return [];
    const source = searchQuery ? allFolders : folders;
    return source.filter((folder) => {
      if (filterStarredOnly && !folder.is_starred) return false;
      if (!searchQuery) return true;
      return folder.name.toLowerCase().includes(searchQuery);
    });
  }, [allFolders, folders, filterKind, filterStarredOnly, searchQuery]);

  const visibleCases = useMemo(() => {
    if (filterKind === "folder") return [];
    const source = searchQuery ? allCases : cases;
    return source.filter((item) => {
      if (filterStarredOnly && !item.is_starred) return false;
      if (filterLabel && normalizeFolderName(item.label ?? "") !== filterLabel) return false;
      if (!searchQuery) return true;
      return getCaseSearchText(item).includes(searchQuery);
    });
  }, [allCases, cases, filterKind, filterLabel, filterStarredOnly, searchQuery]);

  const dashboardResults = useMemo(() => {
    if (!dashboardQuery) return [];
    return allCases
      .filter((item) => getCaseSearchText(item).includes(dashboardQuery))
      .slice(0, 12);
  }, [allCases, dashboardQuery]);

  const isGlobalSearch = Boolean(searchQuery);

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data: allData, error: allFoldersError } = await supabase
      .from("folders")
      .select("id, name, parent_id, created_at, updated_at, is_starred")
      .order("created_at", { ascending: true });

    if (allFoldersError) {
      setAllFolders([]);
      setFolders([]);
      setCases([]);
      setError(mapSupabaseError(allFoldersError.message));
      setIsLoading(false);
      return;
    }

    const allRows = (allData ?? []) as FolderRow[];
    setAllFolders(allRows);

    const currentRows = allRows
      .filter((folder) =>
        currentFolderId
          ? folder.parent_id === currentFolderId
          : folder.parent_id === null,
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    setFolders(currentRows);

    const { data: allCaseData, error: casesError } = await supabase
      .from("cases")
      .select(
        "id, title, label, details, case_date, case_date_jalali, status, folder_id, created_at, is_starred",
      )
      .order("created_at", { ascending: false });

    if (casesError) {
      setAllCases([]);
      setCases([]);
      setError(mapSupabaseError(casesError.message));
    } else {
      const allCaseRows = (allCaseData ?? []) as CaseRow[];
      setAllCases(allCaseRows);
      setCases(
        allCaseRows.filter((item) =>
          currentFolderId ? item.folder_id === currentFolderId : item.folder_id === null,
        ),
      );
    }

    if (currentFolderId) {
      const { data: breadcrumbData, error: breadcrumbError } =
        await supabase.rpc("folder_breadcrumbs", {
          folder_id_input: currentFolderId,
        });

      if (breadcrumbError) {
        setBreadcrumbs([]);
        setError(mapSupabaseError(breadcrumbError.message));
      } else {
        setBreadcrumbs((breadcrumbData ?? []) as BreadcrumbRow[]);
      }
    } else {
      setBreadcrumbs([]);
    }

    setIsLoading(false);
  }, [currentFolderId, supabase]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (breadcrumbs.length === 0) return;
    setExpandedFolderIds((previous) => {
      const next = new Set(previous);
      breadcrumbs.forEach((folder) => next.add(folder.id));
      return next;
    });
  }, [breadcrumbs]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = normalizeFolderName(folderName);
    setError("");
    setSuccess("");

    if (!name) {
      setError("نام پوشه را وارد کن.");
      return;
    }

    if (name.length > MAX_FOLDER_NAME) {
      setError(
        `نام پوشه نباید بیشتر از ${formatNumber(MAX_FOLDER_NAME)} کاراکتر باشد.`,
      );
      return;
    }

    setIsCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsCreating(false);
      router.replace("/");
      return;
    }

    const { error: insertError } = await supabase.from("folders").insert({
      name,
      parent_id: currentFolderId,
      created_by: user.id,
    });

    if (insertError) {
      setError(mapSupabaseError(insertError.message));
      setIsCreating(false);
      return;
    }

    setFolderName("");
    setSuccess("پوشه ساخته شد.");
    setIsCreating(false);
    setShowCreatePanel(false);
    await loadFolders();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  function navigateToFolder(folderId: string | null) {
    setError("");
    setSuccess("");
    setMenuFolderId(null);
    setMenuCaseId(null);
    setMenuDocumentId(null);
    setProfileMenuOpen(false);
    setSearch("");
    setCurrentFolderId(folderId);

    if (folderId) {
      router.push(`/dashboard?folder=${folderId}`);
    } else {
      router.push("/dashboard");
    }
  }

  function openFolder(folderId: string) {
    if (openingFolderId || folderId === currentFolderId) return;

    setOpeningFolderId(folderId);
    window.setTimeout(() => {
      navigateToFolder(folderId);
      setOpeningFolderId(null);
    }, OPEN_ANIMATION_MS);
  }

  function goHome() {
    if (openingFolderId) return;
    navigateToFolder(null);
  }

  function goBackFolder() {
    if (openingFolderId) return;
    const parentFolder =
      breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
    navigateToFolder(parentFolder ? parentFolder.id : null);
  }

  function toggleFolderExpansion(
    folderId: string,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.stopPropagation();
    setExpandedFolderIds((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function toggleStar(
    folder: FolderRow,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.stopPropagation();
    setError("");
    setSuccess("");

    const nextValue = !folder.is_starred;
    setAllFolders((previous) =>
      previous.map((item) =>
        item.id === folder.id ? { ...item, is_starred: nextValue } : item,
      ),
    );
    setFolders((previous) =>
      previous.map((item) =>
        item.id === folder.id ? { ...item, is_starred: nextValue } : item,
      ),
    );

    const { error: updateError } = await supabase
      .from("folders")
      .update({ is_starred: nextValue })
      .eq("id", folder.id);

    if (updateError) {
      setError(mapSupabaseError(updateError.message));
      await loadFolders();
    }
  }

  function openMenu(folderId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setProfileMenuOpen(false);
    setMenuFolderId((previous) => (previous === folderId ? null : folderId));
  }

  function openEditModal(
    folder: FolderRow,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.stopPropagation();
    setMenuFolderId(null);
    setEditName(folder.name);
    setModal({ type: "edit", folder });
    setError("");
    setSuccess("");
  }

  function openDeleteModal(
    folder: FolderRow,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.stopPropagation();
    setMenuFolderId(null);
    setModal({ type: "delete", folder });
    setError("");
    setSuccess("");
  }

  function openPasswordModal() {
    setProfileMenuOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
    setError("");
    setSuccess("");
    setActiveAppTab("settings");
    setModal(null);
  }

  function openCaseModal() {
    setCaseTitle("");
    setCaseLabel("");
    setCaseDetails("");
    setCaseDate(getTodayJalali());
    setError("");
    setSuccess("");
    setModal({ type: "case" });
  }

  async function updateFolderName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.type !== "edit") return;

    const name = normalizeFolderName(editName);
    if (!name) {
      setError("نام جدید پوشه را وارد کن.");
      return;
    }

    if (name.length > MAX_FOLDER_NAME) {
      setError(
        `نام پوشه نباید بیشتر از ${formatNumber(MAX_FOLDER_NAME)} کاراکتر باشد.`,
      );
      return;
    }

    setIsMutating(true);
    const { error: updateError } = await supabase
      .from("folders")
      .update({ name })
      .eq("id", modal.folder.id);

    if (updateError) {
      setError(mapSupabaseError(updateError.message));
      setIsMutating(false);
      return;
    }

    setSuccess("نام پوشه ویرایش شد.");
    setModal(null);
    setIsMutating(false);
    await loadFolders();
  }

  async function deleteFolder() {
    if (!modal || modal.type !== "delete") return;

    setIsMutating(true);
    const deletingCurrentFolder = modal.folder.id === currentFolderId;
    const { error: deleteError } = await supabase
      .from("folders")
      .delete()
      .eq("id", modal.folder.id);

    if (deleteError) {
      setError(mapSupabaseError(deleteError.message));
      setIsMutating(false);
      return;
    }

    setSuccess("پوشه حذف شد.");
    setModal(null);
    setIsMutating(false);

    if (deletingCurrentFolder) {
      goBackFolder();
      return;
    }

    await loadFolders();
  }

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const title = normalizeFolderName(caseTitle);
    const label = normalizeFolderName(caseLabel);
    const details = caseDetails.trim();
    const jalaliDate = normalizeJalaliDate(caseDate);

    if (!title) {
      setError("نام پرونده را وارد کن.");
      return;
    }

    if (title.length > MAX_CASE_TITLE) {
      setError(
        `نام پرونده نباید بیشتر از ${formatNumber(MAX_CASE_TITLE)} کاراکتر باشد.`,
      );
      return;
    }

    if (jalaliDate && !isValidJalaliDate(jalaliDate)) {
      setError("تاریخ پرونده را به‌صورت شمسی وارد کن؛ مثل ۱۴۰۳/۰۴/۲۰.");
      return;
    }

    setIsMutating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsMutating(false);
      router.replace("/");
      return;
    }

    const { data: insertedCase, error: insertError } = await supabase
      .from("cases")
      .insert({
        title,
        label: label || null,
        details: details || null,
        case_date_jalali: jalaliDate || null,
        folder_id: currentFolderId,
        created_by: user.id,
        is_starred: false,
      })
      .select("id, title, label, details, case_date, case_date_jalali, status, folder_id, created_at, is_starred")
      .single();

    if (insertError) {
      setError(mapSupabaseError(insertError.message));
      setIsMutating(false);
      return;
    }

    setIsMutating(false);
    setSuccess("پرونده ثبت شد.");
    setModal({ type: "caseCreated", case: insertedCase as CaseRow });
    await loadFolders();
  }


  function openCaseMenu(caseId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setMenuFolderId(null);
    setProfileMenuOpen(false);
    setMenuCaseId((previous) => (previous === caseId ? null : caseId));
  }

  function openCaseEditModal(item: CaseRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setMenuCaseId(null);
    setCaseTitle(item.title);
    setCaseLabel(item.label ?? "");
    setCaseDetails(item.details ?? "");
    setCaseDate(item.case_date_jalali ?? formatDate(item.case_date));
    setError("");
    setSuccess("");
    setModal({ type: "caseEdit", case: item });
  }

  function openCaseDeleteModal(item: CaseRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setMenuCaseId(null);
    setModal({ type: "caseDelete", case: item });
    setError("");
    setSuccess("");
  }

  async function toggleCaseStar(item: CaseRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setError("");
    setSuccess("");

    const nextValue = !item.is_starred;
    setCases((previous) =>
      previous.map((caseItem) =>
        caseItem.id === item.id ? { ...caseItem, is_starred: nextValue } : caseItem,
      ),
    );
    setAllCases((previous) =>
      previous.map((caseItem) =>
        caseItem.id === item.id ? { ...caseItem, is_starred: nextValue } : caseItem,
      ),
    );

    const { error: updateError } = await supabase
      .from("cases")
      .update({ is_starred: nextValue })
      .eq("id", item.id);

    if (updateError) {
      setError(mapSupabaseError(updateError.message));
      await loadFolders();
    }
  }

  async function updateCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.type !== "caseEdit") return;

    const title = normalizeFolderName(caseTitle);
    const label = normalizeFolderName(caseLabel);
    const details = caseDetails.trim();
    const jalaliDate = normalizeJalaliDate(caseDate);

    if (!title) {
      setError("نام پرونده را وارد کن.");
      return;
    }

    if (jalaliDate && !isValidJalaliDate(jalaliDate)) {
      setError("تاریخ پرونده را به‌صورت شمسی وارد کن؛ مثل ۱۴۰۳/۰۴/۲۰.");
      return;
    }

    setIsMutating(true);
    const { error: updateError } = await supabase
      .from("cases")
      .update({
        title,
        label: label || null,
        details: details || null,
        case_date_jalali: jalaliDate || null,
      })
      .eq("id", modal.case.id);

    if (updateError) {
      setError(mapSupabaseError(updateError.message));
      setIsMutating(false);
      return;
    }

    setModal(null);
    setIsMutating(false);
    setSuccess("پرونده ویرایش شد.");
    await loadFolders();
  }

  async function deleteCase() {
    if (!modal || modal.type !== "caseDelete") return;

    setIsMutating(true);
    const { error: deleteError } = await supabase
      .from("cases")
      .delete()
      .eq("id", modal.case.id);

    if (deleteError) {
      setError(mapSupabaseError(deleteError.message));
      setIsMutating(false);
      return;
    }

    setModal(null);
    setIsMutating(false);
    setSuccess("پرونده حذف شد.");
    await loadFolders();
  }

  async function loadCaseDocuments(caseId: string) {
    const { data, error: docsError } = await supabase
      .from("case_documents")
      .select("id, case_id, file_name, file_path, file_size, mime_type, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (docsError) {
      setCaseDocuments([]);
      setDocumentUrls({});
      setError(mapSupabaseError(docsError.message));
      return;
    }

    const rows = (data ?? []) as CaseDocumentRow[];
    setCaseDocuments(rows);

    const imageRows = rows.filter(isImageDocument);
    if (imageRows.length === 0) {
      setDocumentUrls({});
      return;
    }

    const urlEntries = await Promise.all(
      imageRows.map(async (doc) => {
        const { data: signedData } = await supabase.storage
          .from(CASE_DOCUMENTS_BUCKET)
          .createSignedUrl(doc.file_path, 60 * 20);
        return [doc.id, signedData?.signedUrl ?? ""] as const;
      }),
    );

    setDocumentUrls(
      Object.fromEntries(urlEntries.filter(([, url]) => Boolean(url))),
    );
  }

  function openCaseDetails(item: CaseRow, startUpload = false) {
    setMenuCaseId(null);
    setError("");
    setSuccess("");
    setActiveCaseTab(startUpload ? "documents" : "details");
    setDocumentsView("gallery");
    setModal({ type: "caseDetails", case: item });
    void loadCaseDocuments(item.id);
    if (startUpload) {
      window.setTimeout(() => {
        document.getElementById("case-document-upload")?.click();
      }, 150);
    }
  }

  async function uploadCaseDocuments(files: FileList | null, caseItem: CaseRow) {
    if (!files || files.length === 0) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/");
      return;
    }

    setIsUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      const path = `${user.id}/${caseItem.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(CASE_DOCUMENTS_BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setError(mapSupabaseError(uploadError.message));
        setIsUploading(false);
        return;
      }

      const { error: insertDocError } = await supabase
        .from("case_documents")
        .insert({
          case_id: caseItem.id,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          created_by: user.id,
        });

      if (insertDocError) {
        setError(mapSupabaseError(insertDocError.message));
        setIsUploading(false);
        return;
      }
    }

    setIsUploading(false);
    setSuccess("مستندات پرونده آپلود شد.");
    setActiveCaseTab("documents");
    await loadCaseDocuments(caseItem.id);
  }

  async function downloadDocument(doc: CaseDocumentRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setError("");

    const { data, error: signedError } = await supabase.storage
      .from(CASE_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.file_path, 60 * 5, { download: doc.file_name });

    if (signedError || !data?.signedUrl) {
      setError(mapSupabaseError(signedError?.message));
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function isVideoDocument(doc: CaseDocumentRow) {
    const mime = (doc.mime_type ?? "").toLowerCase();
    const name = doc.file_name.toLowerCase();
    return mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(name);
  }

  function isPdfDocument(doc: CaseDocumentRow) {
    const mime = (doc.mime_type ?? "").toLowerCase();
    return mime === "application/pdf" || /\.pdf$/i.test(doc.file_name);
  }

  function openDocumentMenu(docId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setMenuFolderId(null);
    setMenuCaseId(null);
    setProfileMenuOpen(false);
    setMenuDocumentId((previous) => (previous === docId ? null : docId));
  }

  function openDocumentRenameModal(doc: CaseDocumentRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setMenuDocumentId(null);
    setDocumentEditName(doc.file_name);
    setModal({ type: "documentRename", document: doc });
  }

  function openDocumentDeleteModal(doc: CaseDocumentRow, event?: MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setMenuDocumentId(null);
    setModal({ type: "documentDelete", document: doc });
  }

  async function updateDocumentName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.type !== "documentRename") return;

    const fileName = normalizeFolderName(documentEditName);
    if (!fileName) {
      setError("نام مستند را وارد کن.");
      return;
    }

    setIsMutating(true);
    const { error: updateError } = await supabase
      .from("case_documents")
      .update({ file_name: fileName })
      .eq("id", modal.document.id);

    if (updateError) {
      setIsMutating(false);
      setError(mapSupabaseError(updateError.message));
      return;
    }

    const caseId = modal.document.case_id;
    setModal(null);
    setIsMutating(false);
    setSuccess("نام مستند ویرایش شد.");
    await loadCaseDocuments(caseId);
  }

  async function deleteDocumentConfirmed() {
    if (!modal || modal.type !== "documentDelete") return;

    const doc = modal.document;
    setIsMutating(true);
    const { error: storageError } = await supabase.storage
      .from(CASE_DOCUMENTS_BUCKET)
      .remove([doc.file_path]);

    if (storageError) {
      setIsMutating(false);
      setError(mapSupabaseError(storageError.message));
      return;
    }

    const { error: deleteError } = await supabase
      .from("case_documents")
      .delete()
      .eq("id", doc.id);

    if (deleteError) {
      setIsMutating(false);
      setError(mapSupabaseError(deleteError.message));
      return;
    }

    setModal(null);
    setIsMutating(false);
    setSuccess("مستند حذف شد.");
    await loadCaseDocuments(doc.case_id);
  }

  async function openDocumentViewer(doc: CaseDocumentRow, event?: MouseEvent<HTMLElement>) {
    event?.stopPropagation();
    setMenuDocumentId(null);
    setViewerUrl("");
    setViewerDocument(doc);

    const { data, error: signedError } = await supabase.storage
      .from(CASE_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.file_path, 60 * 20);

    if (signedError || !data?.signedUrl) {
      setError(mapSupabaseError(signedError?.message));
      setViewerDocument(null);
      return;
    }

    setViewerUrl(data.signedUrl);
  }

  function closeDocumentViewer() {
    setViewerUrl("");
    setViewerDocument(null);
    setMenuDocumentId(null);
  }

  function renderDocumentActions(doc: CaseDocumentRow) {
    const isMenuOpen = menuDocumentId === doc.id;
    return (
      <div className={styles.documentMenuWrap} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.documentMenuButton}
          onClick={(event) => openDocumentMenu(doc.id, event)}
          aria-label="گزینه‌های مستند"
        >
          <MoreVertical size={17} />
        </button>

        {isMenuOpen ? (
          <div className={styles.documentMenuPanel}>
            <button type="button" onClick={(event) => void downloadDocument(doc, event)}>
              <Download size={15} />
              دانلود
            </button>
            <button type="button" onClick={(event) => openDocumentRenameModal(doc, event)}>
              <Pencil size={15} />
              ویرایش نام
            </button>
            <button
              type="button"
              className={styles.dangerMenuItem}
              onClick={(event) => openDocumentDeleteModal(doc, event)}
            >
              <Trash2 size={15} />
              حذف
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderDocumentList(docs: CaseDocumentRow[]) {
    if (docs.length === 0) {
      return (
        <div className={styles.documentEmpty}>
          هنوز مستندی برای این پرونده آپلود نشده است.
        </div>
      );
    }

    return (
      <div className={styles.documentList}>
        {docs.map((doc) => (
          <div key={doc.id} className={styles.documentItem} onClick={(event) => void openDocumentViewer(doc, event)} role="button" tabIndex={0}>
            {isImageDocument(doc) ? <ImageIcon size={18} /> : isVideoDocument(doc) ? <Video size={18} /> : <FileText size={18} />}
            <div>
              <strong>{doc.file_name}</strong>
              <span>
                {doc.file_size
                  ? `${formatNumber(Math.ceil(doc.file_size / 1024))} کیلوبایت`
                  : "حجم نامشخص"}
              </span>
            </div>
            {renderDocumentActions(doc)}
          </div>
        ))}
      </div>
    );
  }

  function renderDocumentsContent() {
    const imageDocs = caseDocuments.filter(isImageDocument);
    const otherDocs = caseDocuments.filter((doc) => !isImageDocument(doc));
    const showListOnly = documentsView === "list";

    if (caseDocuments.length === 0) {
      return (
        <div className={styles.documentEmpty}>
          هنوز مستندی برای این پرونده آپلود نشده است.
        </div>
      );
    }

    if (showListOnly) return renderDocumentList(caseDocuments);

    return (
      <div className={styles.documentsMixedView}>
        {imageDocs.length > 0 ? (
          <section className={styles.imageGallerySection}>
            <div className={styles.documentsSubHeader}>
              <strong>گالری تصاویر</strong>
              <span>{formatNumber(imageDocs.length)} تصویر</span>
            </div>
            <div className={styles.imageGallery}>
              {imageDocs.map((doc) => (
                <article key={doc.id} className={styles.imageCard} onClick={(event) => void openDocumentViewer(doc, event)} role="button" tabIndex={0}>
                  <div className={styles.imageThumb}>
                    {documentUrls[doc.id] ? (
                      <img src={documentUrls[doc.id]} alt={doc.file_name} />
                    ) : (
                      <ImageIcon size={34} />
                    )}
                  </div>
                  <strong>{doc.file_name}</strong>
                  {renderDocumentActions(doc)}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {otherDocs.length > 0 ? (
          <section className={styles.otherDocumentsSection}>
            <div className={styles.documentsSubHeader}>
              <strong>سایر مستندات</strong>
              <span>{formatNumber(otherDocs.length)} فایل</span>
            </div>
            {renderDocumentList(otherDocs)}
          </section>
        ) : null}
      </div>
    );
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("رمز فعلی را وارد کن.");
      return;
    }

    if (newPassword.length < 6) {
      setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    if (newPassword !== repeatPassword) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }

    setIsMutating(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (verifyError) {
      setError("رمز فعلی درست نیست.");
      setIsMutating(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (passwordError) {
      setError(mapSupabaseError(passwordError.message));
      setIsMutating(false);
      return;
    }

    setModal(null);
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
    setSuccess("رمز عبور با موفقیت تغییر کرد.");
    setIsMutating(false);
  }

  function renderTree(parentId: string | null, depth = 0) {
    const nodes = allFolders.filter((folder) => folder.parent_id === parentId);
    if (nodes.length === 0) return null;

    return (
      <div
        className={styles.treeGroup}
        style={{ paddingInlineStart: depth ? 14 : 0 }}
      >
        {nodes.map((folder) => {
          const childCount = childCountMap.get(folder.id) ?? 0;
          const isActive = folder.id === currentFolderId;
          const isExpanded = expandedFolderIds.has(folder.id);

          return (
            <div key={folder.id} className={styles.treeNode}>
              <div
                className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.treeFolderButton}
                  onClick={() => { setActiveAppTab("records"); navigateToFolder(folder.id); }}
                >
                  <span className={styles.treeCount}>
                    {formatNumber(childCount)}
                  </span>
                  <span className={styles.treeName}>{folder.name}</span>
                  {folder.is_starred ? (
                    <Star
                      className={styles.treeStarIcon}
                      size={14}
                      fill="currentColor"
                    />
                  ) : null}
                  {isActive ? <FolderOpen size={16} /> : <Folder size={16} />}
                </button>

                {childCount > 0 ? (
                  <button
                    type="button"
                    className={styles.treeToggleButton}
                    onClick={(event) => toggleFolderExpansion(folder.id, event)}
                    aria-label={
                      isExpanded ? "بستن زیرپوشه‌ها" : "باز کردن زیرپوشه‌ها"
                    }
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronLeft size={14} />
                    )}
                  </button>
                ) : (
                  <span className={styles.treeTogglePlaceholder} />
                )}
              </div>

              {childCount > 0 && isExpanded
                ? renderTree(folder.id, depth + 1)
                : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderFolderArt(badge: ReactNode = <FileText size={19} />) {
    return (
      <span className={styles.folderArt} aria-hidden="true">
        <span className={styles.folderBack} />
        <span className={`${styles.paper} ${styles.paperOne}`}>
          <FileText size={18} />
        </span>
        <span className={`${styles.paper} ${styles.paperTwo}`} />
        <span className={`${styles.paper} ${styles.paperThree}`} />
        <span className={styles.folderFront}>
          <span className={styles.folderBadge}>{badge}</span>
        </span>
      </span>
    );
  }

  function renderFolderMenu(folder: FolderRow) {
    const isMenuOpen = menuFolderId === folder.id;
    return (
      <>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={`${styles.starButton} ${folder.is_starred ? styles.starButtonActive : ""}`}
            onClick={(event) => void toggleStar(folder, event)}
            aria-label={
              folder.is_starred ? "حذف از ستاره‌ها" : "افزودن به ستاره‌ها"
            }
          >
            <Star
              size={18}
              fill={folder.is_starred ? "currentColor" : "none"}
            />
          </button>

          <button
            type="button"
            className={styles.cardMenuButton}
            onClick={(event) => openMenu(folder.id, event)}
            aria-label="گزینه‌های پوشه"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {isMenuOpen ? (
          <div
            className={styles.cardMenuPanel}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={(event) => openEditModal(folder, event)}
            >
              <Pencil size={15} />
              ویرایش نام
            </button>
            <button
              type="button"
              className={styles.dangerMenuItem}
              onClick={(event) => openDeleteModal(folder, event)}
            >
              <Trash2 size={15} />
              حذف
            </button>
          </div>
        ) : null}
      </>
    );
  }

  function renderFolderCard(folder: FolderRow) {
    const childCount = childCountMap.get(folder.id) ?? 0;
    const isOpening = openingFolderId === folder.id;

    return (
      <article
        key={folder.id}
        className={`${styles.folderCard} ${isOpening ? styles.folderCardOpening : ""}`}
        onClick={() => openFolder(folder.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") openFolder(folder.id);
        }}
      >
        {renderFolderMenu(folder)}
        {renderFolderArt()}
        <span className={styles.folderTitle}>{folder.name}</span>
        <span className={styles.folderMeta}>
          {childCount > 0
            ? `${formatNumber(childCount)} زیرپوشه`
            : "برای ورود کلیک کن"}
        </span>
      </article>
    );
  }

  function renderFolderListItem(folder: FolderRow) {
    const childCount = childCountMap.get(folder.id) ?? 0;
    const isOpening = openingFolderId === folder.id;

    return (
      <article
        key={folder.id}
        className={`${styles.folderListItem} ${isOpening ? styles.folderListItemOpening : ""}`}
        onClick={() => openFolder(folder.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") openFolder(folder.id);
        }}
      >
        <div className={styles.listFolderIcon}>
          <Folder size={22} />
        </div>
        <div className={styles.listFolderInfo}>
          <strong>{folder.name}</strong>
          <span>
            {isGlobalSearch
              ? "نتیجه جستجوی سراسری"
              : childCount > 0
                ? `${formatNumber(childCount)} زیرپوشه`
                : "بدون زیرپوشه"}
          </span>
        </div>
        <span className={styles.listFolderCount}>
          {formatNumber(childCount)}
        </span>
        {renderFolderMenu(folder)}
      </article>
    );
  }

  function renderParentCard() {
    return (
      <article
        className={`${styles.folderCard} ${styles.parentFolderCard}`}
        onClick={goBackFolder}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") goBackFolder();
        }}
      >
        <span className={styles.parentCardArrow} aria-hidden="true">
          <ChevronLeft size={18} />
        </span>
        {renderFolderArt(".")}
        <span className={styles.folderTitle}>.</span>
        <span className={styles.folderMeta}>بازگشت به پوشه قبل</span>
      </article>
    );
  }

  function renderParentListItem() {
    return (
      <article
        className={`${styles.folderListItem} ${styles.parentListItem}`}
        onClick={goBackFolder}
        role="button"
        tabIndex={0}
      >
        <div className={styles.listFolderIcon}>.</div>
        <div className={styles.listFolderInfo}>
          <strong>.</strong>
          <span>بازگشت به پوشه قبل</span>
        </div>
        <ChevronLeft size={18} />
      </article>
    );
  }

  function formatDate(value: string | null, jalaliValue?: string | null) {
    if (jalaliValue) return jalaliValue;
    if (!value) return "بدون تاریخ";
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date(value));
    } catch {
      return value;
    }
  }

  function renderCaseMenu(item: CaseRow) {
    const isMenuOpen = menuCaseId === item.id;

    return (
      <div className={styles.caseActions} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={`${styles.starButton} ${item.is_starred ? styles.starButtonActive : ""}`}
          onClick={(event) => void toggleCaseStar(item, event)}
          aria-label={item.is_starred ? "حذف ستاره پرونده" : "ستاره‌دار کردن پرونده"}
        >
          <Star size={17} fill={item.is_starred ? "currentColor" : "none"} />
        </button>

        <button
          type="button"
          className={styles.cardMenuButton}
          onClick={(event) => openCaseMenu(item.id, event)}
          aria-label="گزینه‌های پرونده"
        >
          <MoreVertical size={17} />
        </button>

        {isMenuOpen ? (
          <div className={styles.caseMenuPanel}>
            <button type="button" onClick={(event) => openCaseEditModal(item, event)}>
              <Pencil size={15} />
              ویرایش پرونده
            </button>
            <button
              type="button"
              className={styles.dangerMenuItem}
              onClick={(event) => openCaseDeleteModal(item, event)}
            >
              <Trash2 size={15} />
              حذف
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderCaseCard(item: CaseRow) {
    return (
      <article
        key={item.id}
        className={`${styles.recordCard} ${menuCaseId === item.id ? styles.recordCardMenuOpen : ""}`}
        onClick={() => openCaseDetails(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") openCaseDetails(item);
        }}
      >
        {renderCaseMenu(item)}
        <span className={styles.caseArt} aria-hidden="true">
          <span className={styles.casePaperBack} />
          <span className={styles.casePaperMain}>
            <ClipboardList size={28} />
          </span>
        </span>
        <span className={styles.folderTitle}>{item.title}</span>
        <span className={styles.folderMeta}>{item.label || "پرونده"}</span>
      </article>
    );
  }

  function renderCaseListItem(item: CaseRow) {
    return (
      <article
        key={item.id}
        className={`${styles.recordListItem} ${menuCaseId === item.id ? styles.recordListItemMenuOpen : ""}`}
        onClick={() => openCaseDetails(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") openCaseDetails(item);
        }}
      >
        <div className={styles.listFolderIcon}>
          <ClipboardList size={22} />
        </div>
        <div className={styles.listFolderInfo}>
          <strong>{item.title}</strong>
          <span>{item.label || formatDate(item.case_date, item.case_date_jalali)}</span>
        </div>
        <span className={styles.caseDateCompact}>{formatDate(item.case_date, item.case_date_jalali)}</span>
        {renderCaseMenu(item)}
      </article>
    );
  }

  function renderUnifiedArea() {
    if (isLoading) {
      return (
        <div className={styles.stateBox}>
          <Loader2 className={styles.spinner} size={24} />
          در حال دریافت پرونده‌ها...
        </div>
      );
    }

    const shouldShowParent = Boolean(currentFolderId) && !isGlobalSearch;
    const hasResults = visibleFolders.length > 0 || visibleCases.length > 0 || shouldShowParent;

    if (!hasResults) {
      return (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>
            <ClipboardList size={32} />
          </div>
          <h2>{isGlobalSearch ? "موردی پیدا نشد" : "هنوز پرونده‌ای اینجا نیست"}</h2>
          <p>
            {isGlobalSearch
              ? "جستجو در کل پوشه‌ها و پرونده‌ها انجام شد؛ عبارت را تغییر بده."
              : "یک پوشه یا پرونده جدید بساز تا این بخش پر شود."}
          </p>
        </div>
      );
    }

    if (viewMode === "list") {
      return (
        <div className={styles.recordList}>
          {shouldShowParent ? renderParentListItem() : null}
          {visibleFolders.map((folder) => renderFolderListItem(folder))}
          {visibleCases.map((item) => renderCaseListItem(item))}
        </div>
      );
    }

    return (
      <div className={styles.recordGrid}>
        {shouldShowParent ? renderParentCard() : null}
        {visibleFolders.map((folder) => renderFolderCard(folder))}
        {visibleCases.map((item) => renderCaseCard(item))}
      </div>
    );
  }

  function renderFilterPanel() {
    if (!showFilters || activeAppTab !== "records") return null;

    return (
      <div className={styles.filterPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.filterField}>
          <span>نوع نمایش</span>
          <select value={filterKind} onChange={(event) => setFilterKind(event.target.value as "all" | "folder" | "case")}>
            <option value="all">همه موارد</option>
            <option value="folder">فقط پوشه‌ها</option>
            <option value="case">فقط پرونده‌ها</option>
          </select>
        </div>
        <div className={styles.filterField}>
          <span>برچسب پرونده</span>
          <select value={filterLabel} onChange={(event) => setFilterLabel(event.target.value)}>
            <option value="">همه برچسب‌ها</option>
            {labelOptions.map((item) => (
              <option key={item.label} value={item.label}>{item.label}</option>
            ))}
          </select>
        </div>
        <label className={styles.filterCheck}>
          <input
            type="checkbox"
            checked={filterStarredOnly}
            onChange={(event) => setFilterStarredOnly(event.target.checked)}
          />
          فقط ستاره‌دارها
        </label>
        <button
          type="button"
          className={styles.clearFilterButton}
          onClick={() => {
            setFilterKind("all");
            setFilterLabel("");
            setFilterStarredOnly(false);
          }}
        >
          پاک کردن فیلترها
        </button>
      </div>
    );
  }

  function renderHomeDashboard() {
    return (
      <section className={styles.homeDashboard}>
        <div className={styles.homeHero}>
          <span className={styles.homeEyebrow}>داشبورد</span>
          <h1>دنبال چه چیزی هستی؟</h1>
          <p>نام پرونده، برچسب، تاریخ یا بخشی از جزئیات را بنویس تا نتیجه‌ها همان لحظه فیلتر شوند.</p>
          <div className={styles.homeSearchBox}>
            <Search size={22} />
            <input
              value={dashboardSearch}
              onChange={(event) => setDashboardSearch(event.target.value)}
              placeholder="جستجو در پرونده‌ها..."
            />
          </div>
          <button
            type="button"
            className={styles.homeManageButton}
            onClick={() => setActiveAppTab("records")}
          >
            <Folder size={18} />
            مدیریت پرونده‌ها
          </button>
        </div>

        <div className={styles.homeResults}>
          <div className={styles.homeResultsHeader}>
            <strong>نتایج جستجو</strong>
            <span>{dashboardQuery ? `${formatNumber(dashboardResults.length)} نتیجه` : "برای شروع جستجو کن"}</span>
          </div>
          {dashboardQuery ? (
            dashboardResults.length > 0 ? (
              <div className={styles.homeResultList}>
                {dashboardResults.map((item) => (
                  <button key={item.id} type="button" onClick={() => openCaseDetails(item)}>
                    <ClipboardList size={18} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{buildPathParts(item.folder_id).join(" / ")} · {item.label || "بدون برچسب"}</small>
                    </span>
                    <em>{formatDate(item.case_date, item.case_date_jalali)}</em>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.homeEmpty}>پرونده‌ای با این عبارت پیدا نشد.</div>
            )
          ) : (
            <div className={styles.homeStats}>
              <div><strong>{formatNumber(allCases.length)}</strong><span>پرونده</span></div>
              <div><strong>{formatNumber(allFolders.length)}</strong><span>پوشه</span></div>
              <div><strong>{formatNumber(allCases.filter((item) => item.is_starred).length)}</strong><span>پرونده ستاره‌دار</span></div>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderSettingsPage() {
    return (
      <section className={styles.settingsPage}>
        <div className={styles.settingsHeader}>
          <h1>تنظیمات</h1>
          <p>مدیریت حساب کاربری، امنیت و تنظیمات پایه سامانه.</p>
        </div>

        <div className={styles.settingsGrid}>
          <div className={styles.settingsCard}>
            <div className={styles.settingsCardTitle}>
              <span className={styles.settingsIcon}><UserRound size={18} /></span>
              <div>
                <strong>اطلاعات حساب</strong>
                <small>اطلاعات اصلی کاربر واردشده</small>
              </div>
            </div>
            <dl className={styles.profileFacts}>
              <div><dt>نام نمایشی</dt><dd>{userDisplayName}</dd></div>
              <div><dt>ایمیل</dt><dd>{userEmail}</dd></div>
              <div><dt>وضعیت</dt><dd>حساب فعال</dd></div>
            </dl>
          </div>

          <form className={styles.settingsCard} onSubmit={changePassword}>
            <div className={styles.settingsCardTitle}>
              <span className={styles.settingsIcon}><LockKeyhole size={18} /></span>
              <div>
                <strong>تغییر رمز عبور</strong>
                <small>برای امنیت بیشتر، رمز فعلی هم بررسی می‌شود.</small>
              </div>
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="رمز فعلی"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="رمز جدید"
            />
            <input
              type="password"
              value={repeatPassword}
              onChange={(event) => setRepeatPassword(event.target.value)}
              placeholder="تکرار رمز جدید"
            />
            <button type="submit" disabled={isMutating}>
              {isMutating ? <Loader2 className={styles.spinner} size={16} /> : <KeyRound size={16} />}
              ذخیره رمز جدید
            </button>
          </form>

          <div className={styles.settingsCard}>
            <div className={styles.settingsCardTitle}>
              <span className={styles.settingsIcon}><SlidersHorizontal size={18} /></span>
              <div>
                <strong>تنظیمات ظاهری و کاری</strong>
                <small>آماده برای توسعه مراحل بعدی</small>
              </div>
            </div>
            <div className={styles.settingRows}>
              <span>زبان رابط کاربری: فارسی</span>
              <span>تقویم پیش‌فرض: شمسی</span>
              <span>نمای پیش‌فرض پرونده‌ها: {viewMode === "grid" ? "کارتی" : "لیستی"}</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderCasesArea() {
    if (isLoading) {
      return (
        <div className={styles.caseState}>
          <Loader2 className={styles.spinner} size={22} />
          در حال دریافت پرونده‌ها...
        </div>
      );
    }

    if (cases.length === 0) {
      return (
        <div className={styles.caseEmpty}>
          <div className={styles.emptyIcon}>
            <ClipboardList size={30} />
          </div>
          <h2>هنوز پرونده‌ای در این مسیر ثبت نشده است</h2>
          <p>
            اول پرونده را بساز؛ بعد بلافاصله می‌توانی مستندات داخل همان پرونده را آپلود کنی.
          </p>
          <button type="button" onClick={openCaseModal}>
            <Plus size={17} />
            ایجاد پرونده
          </button>
        </div>
      );
    }

    return (
      <div className={styles.caseList}>
        {cases.map((item) => (
          <article
            key={item.id}
            className={`${styles.caseRow} ${menuCaseId === item.id ? styles.caseRowMenuOpen : ""}`}
            onClick={() => openCaseDetails(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") openCaseDetails(item);
            }}
          >
            <div className={styles.caseIcon}>
              <ClipboardList size={22} />
            </div>
            <div className={styles.caseInfo}>
              <strong>{item.title}</strong>
              <span>{item.details || "برای مشاهده جزئیات و آپلود مستندات کلیک کن."}</span>
            </div>
            <div className={styles.caseBadge}>{item.label || "بدون برچسب"}</div>
            <div className={styles.caseDate}>
              <CalendarDays size={15} />
              {formatDate(item.case_date, item.case_date_jalali)}
            </div>
            {renderCaseMenu(item)}
          </article>
        ))}
      </div>
    );
  }

  function renderFoldersArea() {
    if (isLoading) {
      return (
        <div className={styles.stateBox}>
          <Loader2 className={styles.spinner} size={24} />
          در حال دریافت پوشه‌ها...
        </div>
      );
    }

    const shouldShowParent = Boolean(currentFolderId) && !isGlobalSearch;
    const hasResults = visibleFolders.length > 0;

    if (!hasResults && !shouldShowParent) {
      return (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>
            <FolderOpen size={32} />
          </div>
          <h2>
            {isGlobalSearch ? "پوشه‌ای پیدا نشد" : "هنوز پوشه‌ای اینجا نیست"}
          </h2>
          <p>
            {isGlobalSearch
              ? "جستجو در کل پوشه‌ها انجام شد؛ عبارت را تغییر بده."
              : "با دکمه «پوشه جدید» اولین پوشه را بساز."}
          </p>
        </div>
      );
    }

    if (viewMode === "list") {
      return (
        <div className={styles.folderList}>
          {shouldShowParent ? renderParentListItem() : null}
          {visibleFolders.map((folder) => renderFolderListItem(folder))}
        </div>
      );
    }

    return (
      <div className={styles.folderGrid}>
        {shouldShowParent ? renderParentCard() : null}
        {visibleFolders.map((folder) => renderFolderCard(folder))}
      </div>
    );
  }

  return (
    <section
      className={styles.shell}
      onClick={() => {
        setMenuFolderId(null);
        setMenuCaseId(null);
        setMenuDocumentId(null);
        setProfileMenuOpen(false);
      }}
    >
      {toast ? (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.message}
        </div>
      ) : null}
      <div className={`${styles.workspace} ${activeAppTab !== "records" ? styles.workspaceCompact : ""}`}>
        <main className={`${styles.mainPanel} ${activeAppTab !== "records" ? styles.mainPanelSimple : ""}`}>
          {activeAppTab === "records" ? (
          <header className={styles.topbar}>
            {activeAppTab === "records" ? (
              <div
                className={styles.actionsRow}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => setShowCreatePanel(true)}
                >
                  <Plus size={18} />
                  <span>پوشه جدید</span>
                </button>

                <button
                  className={styles.secondaryActionButton}
                  type="button"
                  onClick={openCaseModal}
                >
                  <ClipboardList size={18} />
                  <span>پرونده جدید</span>
                </button>

                <div className={styles.filterWrap}>
                  <button
                    className={`${styles.squareButton} ${showFilters ? styles.squareButtonActive : ""}`}
                    type="button"
                    aria-label="فیلترها"
                    onClick={() => setShowFilters((value) => !value)}
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                  {renderFilterPanel()}
                </div>

                <div className={styles.searchBox}>
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="جستجو در همه پوشه‌ها و پرونده‌ها..."
                  />
                </div>
              </div>
            ) : null}
          </header>
          ) : null}

          <section key={activeAppTab} className={`${styles.contentPanel} ${styles.tabScene}`}>
            {activeAppTab === "home" ? (
              renderHomeDashboard()
            ) : activeAppTab === "settings" ? (
              renderSettingsPage()
            ) : (
              <>
                {showCreatePanel ? (
                  <div
                    className={styles.createPanel}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div>
                      <strong>ساخت پوشه در «{currentFolderName}»</strong>
                      <p>نام پوشه را وارد کن تا در مسیر فعلی ساخته شود.</p>
                    </div>
                    <form className={styles.createForm} onSubmit={createFolder}>
                      <input
                        value={folderName}
                        onChange={(event) => setFolderName(event.target.value)}
                        placeholder="نام پوشه"
                        maxLength={MAX_FOLDER_NAME}
                        autoFocus
                      />
                      <button type="submit" disabled={isCreating}>
                        {isCreating ? (
                          <Loader2 className={styles.spinner} size={17} />
                        ) : (
                          <Plus size={17} />
                        )}
                        ایجاد
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => setShowCreatePanel(false)}
                      >
                        <X size={17} />
                      </button>
                    </form>
                  </div>
                ) : null}

                <div className={styles.sectionHeader}>
                  <div>
                    <h1>پرونده‌ها</h1>
                    <span className={styles.searchHint}>
                      {isGlobalSearch
                        ? "نتایج جستجوی سراسری"
                        : currentPathText}
                    </span>
                  </div>
                  <div className={styles.viewSwitch}>
                    <button
                      type="button"
                      className={viewMode === "grid" ? styles.viewButtonActive : ""}
                      onClick={() => setViewMode("grid")}
                      aria-label="نمای کارتی"
                    >
                      <Grid3X3 size={18} />
                    </button>
                    <button
                      type="button"
                      className={viewMode === "list" ? styles.viewButtonActive : ""}
                      onClick={() => setViewMode("list")}
                      aria-label="نمای فهرستی"
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>

                {renderUnifiedArea()}
              </>
            )}
          </section>
        </main>

        {activeAppTab === "records" ? (
        <aside
          className={styles.sidebar}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.sidebarBrand}>
            <h2>سامانه مدیریت پرونده</h2>
            <p>مدیریت هوشمند اسناد و پرونده‌ها</p>
          </div>

          {activeAppTab === "records" ? (
            <>
              <div className={styles.tabs}>
                <button
                  type="button"
                  className={sidebarTab === "folders" ? styles.tabActive : ""}
                  onClick={() => setSidebarTab("folders")}
                >
                  پوشه‌ها
                </button>
                <button
                  type="button"
                  className={sidebarTab === "labels" ? styles.tabActive : ""}
                  onClick={() => setSidebarTab("labels")}
                >
                  برچسب‌ها
                </button>
              </div>

              <nav className={styles.tree}>
                {sidebarTab === "folders" ? (
                  <>
                    <div
                      className={`${styles.treeRow} ${currentFolderId ? "" : styles.treeRowActive}`}
                    >
                      <button
                        type="button"
                        className={styles.treeFolderButton}
                        onClick={() => {
                          setActiveAppTab("records");
                          goHome();
                        }}
                      >
                        <span className={styles.treeCount}>
                          {formatNumber(rootFolders.length)}
                        </span>
                        <span className={styles.treeName}>پرونده‌های عمومی</span>
                        <Folder size={16} />
                      </button>
                      <span className={styles.treeTogglePlaceholder} />
                    </div>

                    {rootFolders.length > 0 ? (
                      renderTree(null)
                    ) : (
                      <p className={styles.treeHint}>هنوز پوشه‌ای ساخته نشده است.</p>
                    )}

                    <div className={styles.starredBlock}>
                      <div className={styles.starredTitle}>
                        <Star size={15} fill="currentColor" />
                        ستاره‌ها
                      </div>
                      {starredFolders.length > 0 ? (
                        <div className={styles.starredList}>
                          {starredFolders.map((folder) => (
                            <button
                              key={folder.id}
                              type="button"
                              className={`${styles.starredItem} ${folder.id === currentFolderId ? styles.starredItemActive : ""}`}
                              onClick={() => {
                                setActiveAppTab("records");
                                navigateToFolder(folder.id);
                              }}
                            >
                              <span>{folder.name}</span>
                              <Folder size={15} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.treeHint}>هنوز پوشه ستاره‌داری نداری.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.labelsPanel}>
                    {labelOptions.length > 0 ? (
                      labelOptions.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={filterLabel === item.label ? styles.labelItemActive : ""}
                          onClick={() => {
                            setFilterLabel(item.label);
                            setFilterKind("case");
                            setActiveAppTab("records");
                          }}
                        >
                          <span>{item.label}</span>
                          <em>{formatNumber(item.count)}</em>
                          <Tag size={15} />
                        </button>
                      ))
                    ) : (
                      <p className={styles.treeHint}>هنوز برچسبی برای پرونده‌ها ثبت نشده است.</p>
                    )}
                    {filterLabel ? (
                      <button
                        type="button"
                        className={styles.clearLabelFilter}
                        onClick={() => setFilterLabel("")}
                      >
                        حذف فیلتر برچسب
                      </button>
                    ) : null}
                  </div>
                )}
              </nav>
            </>
          ) : (
            <div className={styles.sidebarSpacer} aria-hidden="true" />
          )}

        </aside>
        ) : null}

        <aside className={styles.iconRail} onClick={(event) => event.stopPropagation()}>
          <div className={styles.logoMark}>
            <Layers3 size={24} />
          </div>
          <nav>
            <button
              type="button"
              className={activeAppTab === "home" ? styles.railActive : ""}
              aria-label="خانه"
              onClick={() => setActiveAppTab("home")}
            >
              <Home size={21} />
            </button>
            <button
              type="button"
              className={activeAppTab === "records" ? styles.railActive : ""}
              aria-label="پوشه‌ها"
              onClick={() => setActiveAppTab("records")}
            >
              <Folder size={21} />
            </button>
            {/* آیکون‌های اسناد و گزارش‌ها فعلاً مخفی شدند.
            <button type="button" aria-label="اسناد" onClick={() => setActiveAppTab("records")}>
              <FileText size={21} />
            </button>
            <button type="button" aria-label="گزارش‌ها" onClick={() => setActiveAppTab("home")}>
              <BarChart3 size={21} />
            </button>
            */}
            <button
              type="button"
              className={activeAppTab === "settings" ? styles.railActive : ""}
              aria-label="تنظیمات"
              onClick={() => setActiveAppTab("settings")}
            >
              <Settings size={21} />
            </button>
          </nav>

          <div className={styles.railProfileArea}>
            <button
              type="button"
              className={styles.railAvatarButton}
              onClick={(event) => {
                event.stopPropagation();
                setMenuFolderId(null);
                setMenuCaseId(null);
                setMenuDocumentId(null);
                setProfileMenuOpen((value) => !value);
              }}
              title={userDisplayName}
              aria-label="پروفایل کاربر"
            >
              {userDisplayName.slice(0, 1)}
            </button>

            {profileMenuOpen ? (
              <div className={`${styles.profileMenu} ${styles.railProfileMenu}`}>
                <div className={styles.railProfileInfo}>
                  <strong>{userDisplayName}</strong>
                  <small>{userEmail || "حساب فعال"}</small>
                </div>
                <button type="button" onClick={openPasswordModal}>
                  <KeyRound size={16} />
                  تغییر رمز
                </button>
                <button
                  type="button"
                  className={styles.profileLogoutButton}
                  onClick={() => void signOut()}
                >
                  <LogOut size={16} />
                  خروج
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {viewerDocument ? (
        <div className={styles.viewerOverlay} onClick={closeDocumentViewer}>
          <div className={styles.viewerShell} onClick={(event) => event.stopPropagation()}>
            <div className={styles.viewerTopbar}>
              <button
                type="button"
                className={styles.viewerBackButton}
                onClick={closeDocumentViewer}
              >
                <ChevronLeft size={18} />
                بازگشت
              </button>
              <strong>{viewerDocument.file_name}</strong>
              {renderDocumentActions(viewerDocument)}
            </div>
            <div className={styles.viewerBody}>
              {!viewerUrl ? (
                <div className={styles.documentEmpty}>
                  <Loader2 className={styles.spinner} size={26} />
                  در حال آماده‌سازی پیش‌نمایش...
                </div>
              ) : isImageDocument(viewerDocument) ? (
                <img src={viewerUrl} alt={viewerDocument.file_name} />
              ) : isVideoDocument(viewerDocument) ? (
                <video src={viewerUrl} controls />
              ) : isPdfDocument(viewerDocument) ? (
                <iframe src={viewerUrl} title={viewerDocument.file_name} />
              ) : (
                <div className={styles.unsupportedPreview}>
                  <FileText size={42} />
                  <h3>پیش‌نمایش این فرمت در مرورگر آماده نیست</h3>
                  <p>برای مشاهده، فایل را دانلود کن.</p>
                  <button type="button" onClick={(event) => void downloadDocument(viewerDocument, event)}>
                    <Download size={17} />
                    دانلود فایل
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div className={styles.modalOverlay} onClick={() => setModal(null)}>
          <div
            className={`${styles.modalCard} ${modal.type === "caseDetails" || modal.type === "documentViewer" ? styles.modalCardLarge : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setModal(null)}
              aria-label="بستن"
            >
              <X size={18} />
            </button>

            {modal.type === "edit" ? (
              <form onSubmit={updateFolderName}>
                <h2>ویرایش نام پوشه</h2>
                <p>نام جدید پوشه «{modal.folder.name}» را وارد کن.</p>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={MAX_FOLDER_NAME}
                  autoFocus
                />
                <div className={styles.modalActions}>
                  <button type="submit" disabled={isMutating}>
                    {isMutating ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : null}
                    ذخیره تغییرات
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            ) : modal.type === "delete" ? (
              <div>
                <h2>حذف پوشه</h2>
                <p>
                  پوشه «{modal.folder.name}» و همه زیرپوشه‌های داخل آن حذف
                  می‌شود. ادامه می‌دهی؟
                </p>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalDangerButton}
                    disabled={isMutating}
                    onClick={() => void deleteFolder()}
                  >
                    {isMutating ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    حذف پوشه
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </div>
            ) : modal.type === "case" ? (
              <form onSubmit={createCase}>
                <h2>ایجاد پرونده</h2>
                <p>
                  اطلاعات اولیه پرونده را ثبت کن. بعد از ثبت، همان‌جا می‌توانی مستندات پرونده را آپلود کنی.
                </p>
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  maxLength={MAX_CASE_TITLE}
                  placeholder="نام پرونده"
                  autoFocus
                />
                <input
                  value={caseLabel}
                  onChange={(event) => setCaseLabel(event.target.value)}
                  placeholder="برچسب پرونده، مثل قرارداد یا مکاتبات"
                />
                <input
                  inputMode="numeric"
                  value={caseDate}
                  onChange={(event) => setCaseDate(event.target.value)}
                  placeholder="تاریخ شمسی؛ مثل ۱۴۰۳/۰۴/۲۰"
                />
                <textarea
                  value={caseDetails}
                  onChange={(event) => setCaseDetails(event.target.value)}
                  placeholder="جزئیات پرونده"
                  rows={4}
                />
                <div className={styles.modalActions}>
                  <button type="submit" disabled={isMutating}>
                    {isMutating ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <ClipboardList size={16} />
                    )}
                    ثبت پرونده
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            ) : modal.type === "caseCreated" ? (
              <div className={styles.createdCaseBox}>
                <h2>پرونده ثبت شد</h2>
                <p>
                  پرونده «{modal.case.title}» با موفقیت ساخته شد. حالا می‌توانی پرونده دیگری بسازی، برگردی یا مستندات همین پرونده را آپلود کنی.
                </p>
                <div className={styles.modalActions}>
                  <button type="button" onClick={() => openCaseModal()}>
                    <Plus size={16} />
                    ثبت پرونده دیگر
                  </button>
                  <button
                    type="button"
                    onClick={() => openCaseDetails(modal.case, true)}
                  >
                    <UploadCloud size={16} />
                    آپلود مستندات
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    بازگشت
                  </button>
                </div>
              </div>
            ) : modal.type === "caseDetails" ? (
              <div className={styles.caseDetailsModal}>
                <div className={styles.caseDetailsHeader}>
                  <div>
                    <h2>{modal.case.title}</h2>
                    <p>مسیر: {buildPathParts(modal.case.folder_id).join(" / ")}</p>
                  </div>
                  <div className={styles.caseDetailMeta}>
                    <span>{modal.case.label || "بدون برچسب"}</span>
                    <span>{formatDate(modal.case.case_date, modal.case.case_date_jalali)}</span>
                  </div>
                </div>

                <div className={styles.caseTabs}>
                  <button
                    type="button"
                    className={activeCaseTab === "details" ? styles.caseTabActive : ""}
                    onClick={() => setActiveCaseTab("details")}
                  >
                    جزئیات
                  </button>
                  <button
                    type="button"
                    className={activeCaseTab === "documents" ? styles.caseTabActive : ""}
                    onClick={() => setActiveCaseTab("documents")}
                  >
                    مستندات
                    <span>{formatNumber(caseDocuments.length)}</span>
                  </button>
                </div>

                {activeCaseTab === "details" ? (
                  <div className={styles.caseDetailBody}>
                    <div className={styles.detailField}>
                      <span>نام پرونده</span>
                      <strong>{modal.case.title}</strong>
                    </div>
                    <div className={styles.detailField}>
                      <span>برچسب</span>
                      <strong>{modal.case.label || "بدون برچسب"}</strong>
                    </div>
                    <div className={styles.detailField}>
                      <span>تاریخ پرونده</span>
                      <strong>{formatDate(modal.case.case_date, modal.case.case_date_jalali)}</strong>
                    </div>
                    <div className={`${styles.detailField} ${styles.detailFieldWide}`}>
                      <span>جزئیات</span>
                      <p>{modal.case.details || "جزئیاتی برای این پرونده ثبت نشده است."}</p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.caseDocumentsTab}>
                    <div className={styles.uploadPanel}>
                      <div>
                        <strong>مستندات پرونده</strong>
                        <p>تصاویر به‌صورت گالری نمایش داده می‌شوند و سایر فایل‌ها در لیست جدا می‌آیند.</p>
                      </div>
                      <div className={styles.documentToolbar}>
                        <button
                          type="button"
                          className={styles.documentViewButton}
                          onClick={() =>
                            setDocumentsView((value) =>
                              value === "gallery" ? "list" : "gallery",
                            )
                          }
                        >
                          {documentsView === "gallery" ? "نمایش همه به صورت لیست" : "نمایش گالری"}
                        </button>
                        <label className={styles.uploadButton} htmlFor="case-document-upload">
                          {isUploading ? (
                            <Loader2 className={styles.spinner} size={17} />
                          ) : (
                            <UploadCloud size={17} />
                          )}
                          آپلود فایل
                        </label>
                      </div>
                      <input
                        id="case-document-upload"
                        type="file"
                        multiple
                        className={styles.hiddenFileInput}
                        onChange={(event) => void uploadCaseDocuments(event.target.files, modal.case)}
                      />
                    </div>

                    {renderDocumentsContent()}
                  </div>
                )}
              </div>
            ) : modal.type === "caseEdit" ? (
              <form onSubmit={updateCase}>
                <h2>ویرایش پرونده</h2>
                <p>اطلاعات پرونده را اصلاح کن.</p>
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  maxLength={MAX_CASE_TITLE}
                  placeholder="نام پرونده"
                  autoFocus
                />
                <input
                  value={caseLabel}
                  onChange={(event) => setCaseLabel(event.target.value)}
                  placeholder="برچسب پرونده"
                />
                <input
                  inputMode="numeric"
                  value={caseDate}
                  onChange={(event) => setCaseDate(event.target.value)}
                  placeholder="تاریخ شمسی؛ مثل ۱۴۰۳/۰۴/۲۰"
                />
                <textarea
                  value={caseDetails}
                  onChange={(event) => setCaseDetails(event.target.value)}
                  placeholder="جزئیات پرونده"
                  rows={4}
                />
                <div className={styles.modalActions}>
                  <button type="submit" disabled={isMutating}>
                    {isMutating ? <Loader2 className={styles.spinner} size={16} /> : null}
                    ذخیره تغییرات
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            ) : modal.type === "caseDelete" ? (
              <div>
                <h2>حذف پرونده</h2>
                <p>پرونده «{modal.case.title}» حذف می‌شود. ادامه می‌دهی؟</p>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalDangerButton}
                    disabled={isMutating}
                    onClick={() => void deleteCase()}
                  >
                    {isMutating ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    حذف پرونده
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </div>
            ) : modal.type === "documentRename" ? (
              <form onSubmit={updateDocumentName}>
                <h2>ویرایش نام مستند</h2>
                <p>نام جدید مستند «{modal.document.file_name}» را وارد کن.</p>
                <input
                  value={documentEditName}
                  onChange={(event) => setDocumentEditName(event.target.value)}
                  placeholder="نام مستند"
                  autoFocus
                />
                <div className={styles.modalActions}>
                  <button type="submit" disabled={isMutating}>
                    {isMutating ? <Loader2 className={styles.spinner} size={16} /> : <Pencil size={16} />}
                    ذخیره نام
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            ) : modal.type === "documentDelete" ? (
              <div>
                <h2>حذف مستند</h2>
                <p>آیا از حذف مستند «{modal.document.file_name}» مطمئنی؟ این عملیات قابل بازگشت نیست.</p>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalDangerButton}
                    disabled={isMutating}
                    onClick={() => void deleteDocumentConfirmed()}
                  >
                    {isMutating ? <Loader2 className={styles.spinner} size={16} /> : <Trash2 size={16} />}
                    حذف مستند
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </div>
            ) : modal.type === "documentViewer" ? (
              <div className={styles.viewerModal}>
                <div className={styles.viewerTopbar}>
                  <button
                    type="button"
                    className={styles.viewerBackButton}
                    onClick={() => {
                      setViewerUrl("");
                      setModal(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                    بازگشت
                  </button>
                  <strong>{modal.document.file_name}</strong>
                  {renderDocumentActions(modal.document)}
                </div>
                <div className={styles.viewerBody}>
                  {!viewerUrl ? (
                    <div className={styles.documentEmpty}>
                      <Loader2 className={styles.spinner} size={26} />
                      در حال آماده‌سازی پیش‌نمایش...
                    </div>
                  ) : isImageDocument(modal.document) ? (
                    <img src={viewerUrl} alt={modal.document.file_name} />
                  ) : isVideoDocument(modal.document) ? (
                    <video src={viewerUrl} controls />
                  ) : isPdfDocument(modal.document) ? (
                    <iframe src={viewerUrl} title={modal.document.file_name} />
                  ) : (
                    <div className={styles.unsupportedPreview}>
                      <FileText size={42} />
                      <h3>پیش‌نمایش این فرمت در مرورگر آماده نیست</h3>
                      <p>برای مشاهده، فایل را دانلود کن.</p>
                      <button type="button" onClick={(event) => void downloadDocument(modal.document, event)}>
                        <Download size={17} />
                        دانلود فایل
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={changePassword}>
                <h2>تغییر رمز عبور</h2>
                <p>رمز فعلی و رمز جدید حساب خود را وارد کن.</p>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="رمز فعلی"
                  autoFocus
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="رمز جدید"
                />
                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  placeholder="تکرار رمز جدید"
                />
                <div className={styles.modalActions}>
                  <button type="submit" disabled={isMutating}>
                    {isMutating ? (
                      <Loader2 className={styles.spinner} size={16} />
                    ) : (
                      <KeyRound size={16} />
                    )}
                    تغییر رمز
                  </button>
                  <button
                    type="button"
                    className={styles.modalSecondaryButton}
                    onClick={() => setModal(null)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
