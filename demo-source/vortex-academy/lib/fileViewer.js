export const MAX_TXT_BYTES = 200 * 1024; // 200 KB

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);

export function getSafeHttpsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

export function getPathnameExtension(rawUrl) {
  const safeUrl = getSafeHttpsUrl(rawUrl);
  if (!safeUrl) return "";
  try {
    const { pathname } = new URL(safeUrl);
    const decodedPath = decodeURIComponent(pathname);
    const lastSegment = decodedPath.split("/").pop() || "";
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return "";
    return lastSegment.slice(dotIndex + 1).toLowerCase();
  } catch (_) {
    return "";
  }
}

export function getFileViewerType(rawUrl) {
  const safeUrl = getSafeHttpsUrl(rawUrl);
  if (!safeUrl) return "invalid";

  const ext = getPathnameExtension(safeUrl);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "txt") return "txt";
  if (OFFICE_EXTENSIONS.has(ext)) return "office";
  return "download";
}

export function getOfficeEmbedUrl(rawUrl) {
  const safeUrl = getSafeHttpsUrl(rawUrl);
  if (!safeUrl) return null;
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(safeUrl)}`;
}

export function getDownloadUrl(fileUrl, title) {
  const safeUrl = getSafeHttpsUrl(fileUrl);
  if (!safeUrl) return null;

  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (
    !baseUrl ||
    baseUrl.includes("your-project.supabase.co") ||
    baseUrl.includes("placeholder-vortex.supabase.co")
  ) {
    return null;
  }

  const prefix = `${baseUrl}/storage/v1/object/public/`;
  if (!safeUrl.startsWith(prefix)) return null;

  try {
    const u = new URL(safeUrl);
    const ext = getPathnameExtension(safeUrl);
    if (ext === "mp4" || ext === "webm") return null;

    const cleanedTitle = String(title || "file")
      .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+|\.+$/g, "");

    const baseName = cleanedTitle || "file";
    const fileName =
      ext && !baseName.toLowerCase().endsWith(`.${ext}`) ? `${baseName}.${ext}` : baseName;

    u.search = `download=${encodeURIComponent(fileName)}`;
    return u.toString();
  } catch (_) {
    return null;
  }
}