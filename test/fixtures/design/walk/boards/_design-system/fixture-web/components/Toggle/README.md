A two-state switch row: label on the left, an "On"/"Off" word and the switch on the right.

**When to use.** One boolean setting, such as "Email notifications". Place it inside a `Card`, above any account action.

**What you provide.** `label` (it wraps rather than truncates), `checked` and `onChange(next)`. The caller owns the value; nothing is saved here.

**Rules.** The whole row is one native button with `role="switch"` and `aria-checked`, at least 44px tall, toggled by Tab, Space and Enter. State is carried by the word and the thumb position, never colour alone. On track is `brand`, off track is `slate-500` (about 4.8:1 on white); the focus ring is a 3px `ink` outline. Movement is instant under reduced motion.
