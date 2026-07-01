export function Avatar({ src, initials, size = 'md' }) {
  const cls = size === 'lg' ? 'avatar lg' : size === 'xl' ? 'avatar xl' : 'avatar';
  if (src) {
    return (
      <span className={`${cls} has-img`}>
        <img src={src} alt="avatar" />
      </span>
    );
  }
  return <span className={cls}>{initials}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="spinner">{label}</div>;
}

export function Empty({ children = 'No records found' }) {
  return <div className="empty">{children}</div>;
}

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${type}`}>{children}</div>;
}

export function Pagination({ page, totalPages, total, onPage }) {
  return (
    <div className="pagination">
      <span>{total} record(s)</span>
      <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Prev
      </button>
      <span>
        Page {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next ›
      </button>
    </div>
  );
}

const STATUS_CLASS = {
  active: 'badge-green',
  graduated: 'badge',
  inactive: 'badge-gray',
  planned: 'badge-gray',
  on_hold: 'badge-amber',
  completed: 'badge-green',
  cancelled: 'badge-red',
  pledged: 'badge-amber',
  closed: 'badge-gray',
  pending: 'badge-gray',
  in_progress: 'badge-amber',
  done: 'badge-green',
  delayed: 'badge-red',
  present: 'badge-green',
  absent: 'badge-red',
  leave: 'badge-amber',
};

export function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-gray">—</span>;
  const cls = STATUS_CLASS[status] || 'badge-gray';
  return <span className={`badge ${cls}`}>{String(status).replace('_', ' ')}</span>;
}

export function money(n, currency = 'INR') {
  const v = Number(n || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

/** Amount to Indian words, e.g. 70000 -> "Seventy Thousand". */
export function amountInWords(value) {
  let num = Math.round(Number(value) || 0);
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n) => {
    let s = '';
    if (n > 99) { s += a[Math.floor(n / 100)] + ' Hundred'; if (n % 100) s += ' '; }
    if (n % 100) s += two(n % 100);
    return s;
  };
  let words = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) words += three(crore) + ' Crore ';
  if (lakh) words += two(lakh) + ' Lakh ';
  if (thousand) words += two(thousand) + ' Thousand ';
  if (num) words += three(num);
  return words.trim();
}

/** 'YYYY-MM' -> 'June 2026' */
export function fmtMonth(period) {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${months[(m || 1) - 1]} ${y}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
