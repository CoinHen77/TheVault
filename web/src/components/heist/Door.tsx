export type DoorState = 'closed' | 'opening' | 'open';

/** Intrinsic 1x sizes of the artwork in /public/vault (2x files are double). */
const DOOR_SIZE: Record<DoorState, { width: number; height: number }> = {
  closed: { width: 227, height: 240 },
  opening: { width: 204, height: 240 },
  open: { width: 238, height: 240 },
};

const DOOR_ALT: Record<DoorState, string> = {
  closed: 'Closed vault door',
  opening: 'Vault door swinging open',
  open: 'Open vault door',
};

export function doorSrc(state: DoorState): { src: string; srcSet: string } {
  return { src: `/vault/${state}.webp`, srcSet: `/vault/${state}.webp 1x, /vault/${state}@2x.webp 2x` };
}

/**
 * The steel vault door artwork. `height` sets the rendered size; width follows
 * the artwork's aspect ratio so the three states line up when swapped.
 */
export default function Door({
  state,
  height = 240,
  decorative = false,
  className = '',
}: {
  state: DoorState;
  height?: number;
  decorative?: boolean;
  className?: string;
}) {
  const { width: w, height: h } = DOOR_SIZE[state];
  const { src, srcSet } = doorSrc(state);
  return (
    <img
      src={src}
      srcSet={srcSet}
      width={Math.round((w * height) / h)}
      height={height}
      alt={decorative ? '' : DOOR_ALT[state]}
      draggable={false}
      className={`select-none drop-shadow-[0_10px_22px_rgba(0,0,0,0.6)] ${className}`}
    />
  );
}
