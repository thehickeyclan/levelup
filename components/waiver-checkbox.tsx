'use client';

/**
 * Required participation-waiver checkbox shown at every session checkout.
 * Matt's spec: just a check with a link to the waiver, every time.
 */
export function WaiverCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#B89D60]"
      />
      <span>
        I agree to the{' '}
        <a href="/waiver" target="_blank" rel="noopener noreferrer" className="text-accent underline">
          Participation Waiver
        </a>{' '}
        for this session.
      </span>
    </label>
  );
}
