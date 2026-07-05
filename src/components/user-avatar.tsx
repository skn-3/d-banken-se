import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { signAvatarPaths } from "@/lib/avatars.functions";

export interface AvatarSubject {
  user_id: string;
  avatar_key: string | null;
  photo_path: string | null;
  first_name?: string | null;
}

interface CatalogItem { key: string; emoji: string; color: string }

// Fallback color/emoji when catalog not loaded
const FALLBACK: Record<string, CatalogItem> = {
  kronorn: { key: "kronorn", emoji: "🦅", color: "#F6B27A" },
  jaguar: { key: "jaguar", emoji: "🐆", color: "#9FD9B6" },
  bi: { key: "bi", emoji: "🐝", color: "#DCBE6E" },
  tamarin: { key: "tamarin", emoji: "🐒", color: "#C7EAD4" },
  uggla: { key: "uggla", emoji: "🦉", color: "#EAF7EE" },
  guldtrad: { key: "guldtrad", emoji: "🌳", color: "#F1D580" },
  eldrav: { key: "eldrav", emoji: "🔥", color: "#F4A88A" },
  myrslok: { key: "myrslok", emoji: "🐜", color: "#CDB79E" },
};

export function useSignedAvatars(subjects: AvatarSubject[]): Record<string, string> {
  const sign = useServerFn(signAvatarPaths);
  const paths = useMemo(
    () => Array.from(new Set(subjects.map(s => s.photo_path).filter(Boolean))) as string[],
    [subjects],
  );
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (paths.length === 0) { setUrls({}); return; }
    sign({ data: { paths } }).then(r => setUrls(r.urls ?? {})).catch(() => setUrls({}));
  }, [key, paths, sign]);
  return urls;
}

export function AvatarCircle({
  subject, size = 40, urls, ring = true,
}: { subject: AvatarSubject; size?: number; urls?: Record<string, string>; ring?: boolean }) {
  const url = subject.photo_path && urls?.[subject.photo_path];
  const av = FALLBACK[subject.avatar_key ?? "kronorn"] ?? FALLBACK.kronorn;
  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: "9999px",
    boxShadow: ring ? "0 0 0 2px #fff, 0 1px 2px rgba(0,0,0,0.15)" : undefined,
  };
  if (url) {
    return <img src={url} alt={subject.first_name ?? "avatar"} className="object-cover" style={style} />;
  }
  return (
    <div className="flex items-center justify-center" style={{ ...style, background: av.color, fontSize: size * 0.55 }}>
      <span>{av.emoji}</span>
    </div>
  );
}
