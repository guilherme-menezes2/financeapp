function SummaryCard({ label, value, tone = "neutral" }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
    </article>
  );
}

export default SummaryCard;
