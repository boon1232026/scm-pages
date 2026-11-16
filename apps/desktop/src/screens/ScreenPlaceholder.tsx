interface Props {
  title: string;
  phase: number;
  description: string;
}

export default function ScreenPlaceholder({ title, phase, description }: Props) {
  return (
    <>
      <h2>{title}</h2>
      <div className="card">
        <span className="badge warn">PHASE {phase}</span>
        <p className="muted" style={{ marginTop: 12 }}>{description}</p>
      </div>
    </>
  );
}
