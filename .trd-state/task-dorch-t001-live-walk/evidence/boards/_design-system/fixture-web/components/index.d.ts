export interface ButtonProps {
  children?: React.ReactNode;
  onClick?: () => void;
  /** "primary" fills with brand; "secondary" is white with a brand border. Default "primary". */
  variant?: 'primary' | 'secondary';
}
export function Button(props: ButtonProps): JSX.Element;

export interface CardProps {
  /** Heading shown at the top of the card. */
  title: string;
  children?: React.ReactNode;
}
export function Card(props: CardProps): JSX.Element;

export interface ChipProps {
  children?: React.ReactNode;
}
export function Chip(props: ChipProps): JSX.Element;

export interface ToggleProps {
  /** Visible label; it is also the switch's accessible name. */
  label: string;
  /** Current value. The caller owns it. */
  checked?: boolean;
  /** Called with the next value when the row is activated. */
  onChange?: (next: boolean) => void;
}
export function Toggle(props: ToggleProps): JSX.Element;
