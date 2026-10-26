import { Progress } from '@/components/ui/progress';

interface Props {
  /** What the run is on now (the sheet being exported). */
  detail?: string;
  /** How far the run is, 0 to 100. */
  value: number;
  /** The same in words ("Exporting 3 of 12"): the bar's name for a screen reader. */
  label: string;
}

/** The description of a toast that counts a run: what it is on, and a bar of how much is done. Updated in place with the toast's id. */
export function ToastProgress({ detail, value, label }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {detail && <div className="truncate">{detail}</div>}
      <Progress value={value} aria-label={label} getValueLabel={() => label} />
    </div>
  );
}
