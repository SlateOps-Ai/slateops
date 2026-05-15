import { redirect } from 'next/navigation'

// /billing is referenced from credit-out upgrade buttons and direct URL nav.
// The actual upgrade UI lives as a modal inside /office, so we just bounce
// over with a query flag and let OfficeCanvas open the panel on mount.
export default function BillingPage() {
  redirect('/office?billing=1')
}
