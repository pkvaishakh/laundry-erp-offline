import { STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
