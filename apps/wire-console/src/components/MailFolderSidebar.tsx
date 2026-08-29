import { useCopy } from "@ops-shared/define-copy";
import type { MailFolder } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface FolderItem {
  id: MailFolder;
  label: string;
  count?: number;
}

interface Props {
  active: MailFolder;
  counts: { ours: number; theirs: number };
  onSelect: (folder: MailFolder) => void;
}

/** 待ちだけを見せる。起案は秘書、完了済みは出さない。 */
export function MailFolderSidebar({ active, counts, onSelect }: Props) {
  const copy = useCopy(WIRE_COPY);
  const folders: FolderItem[] = [
    { id: "ours", label: copy.waitingOurs, count: counts.ours },
    { id: "theirs", label: copy.waitingTheirs, count: counts.theirs },
  ];

  return (
    <nav className="mail-sidebar" aria-label={copy.folders}>
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className={active === f.id ? "mail-folder active" : "mail-folder"}
          onClick={() => onSelect(f.id)}
        >
          <span>{f.label}</span>
          {f.count ? <span className="mail-folder-count">{f.count}</span> : null}
        </button>
      ))}
    </nav>
  );
}
