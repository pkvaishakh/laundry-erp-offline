"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Plural label for the footer text, e.g. "order(s)", "customer(s)". Defaults to "item(s)". */
  itemLabel?: string;
}

/** Shared "Showing X–Y of Z" + Prev/Next footer for paginated list pages. */
export default function Pagination({ page, pageSize, total, onPageChange, itemLabel = "item(s)" }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
      <div className="text-xs text-slate-400">
        {total === 0
          ? `0 ${itemLabel} found`
          : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} ${itemLabel}`}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
