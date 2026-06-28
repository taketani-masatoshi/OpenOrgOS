import type { MailFolder } from "../api";

interface FolderItem {
  id: MailFolder;
  label: string;
  count?: number;
}

interface Props {
  active: MailFolder;
  counts: { inbox: number; outbox: number; pending: number; witness: number; threads: number };
  showWitnessFolder?: boolean;
  onSelect: (folder: MailFolder) => void;
}

export function MailFolderSidebar({ active, counts, showWitnessFolder, onSelect }: Props) {
  const folders: FolderItem[] = [
    { id: "inbox", label: "受信", count: counts.inbox },
    { id: "outbox", label: "送信", count: counts.outbox },
    { id: "pending", label: "送信待ち", count: counts.pending },
    ...(showWitnessFolder ? [{ id: "witness" as MailFolder, label: "確認待ち", count: counts.witness }] : []),
    { id: "threads", label: "スレッド", count: counts.threads },
  ];

  return (
    <nav className="mail-sidebar" aria-label="フォルダ">
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
