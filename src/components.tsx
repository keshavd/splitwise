import { useState, type FormEvent } from 'react'
import { Check, CircleDollarSign, Plus, Trash2, X } from 'lucide-react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { sendFriendInvite } from './email'
import { currentUserId } from './data'
import { useStore } from './store'
import type { ExpenseItem, ExpenseSplit, Person } from './types'

export const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(Math.abs(value))

type DraftExpenseItem = Omit<ExpenseItem, 'amount'> & { amount: string }

function updateDecimal(value: string, update: (next: string) => void) {
  const normalized = value.replace(',', '.')
  if (/^\d*(?:\.\d{0,2})?$/.test(normalized)) update(normalized)
}

function finishDecimal(value: string, update: (next: string) => void) {
  if (value && Number.isFinite(Number(value))) update(Number(value).toFixed(2))
}

export function Avatar({ person, small = false }: { person?: Person; small?: boolean }) {
  return <span className={`avatar ${small ? 'small' : ''}`} style={{ background: person?.color }}>
    {person?.initials || '?'}
  </span>
}

export function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signup, setSignup] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!auth) return
    setError('')
    try {
      if (signup) await createUserWithEmailAndPassword(auth, email, password)
      else await signInWithEmailAndPassword(auth, email, password)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace('Firebase: ', '') : 'Could not sign in')
    }
  }

  return <main className="auth-shell">
    <section className="auth-art">
      <div className="brand light"><span className="brandmark"><CircleDollarSign /></span>fairshare</div>
      <div><p className="eyebrow">MONEY, MINUS THE AWKWARD</p><h1>Good friends.<br />Clear tabs.</h1>
        <p>Share costs, settle up, and get back to the moments that matter.</p></div>
      <div className="quote">“Finally, a group chat without the spreadsheet.”</div>
    </section>
    <section className="auth-form">
      <div className="mobile-brand brand"><span className="brandmark"><CircleDollarSign /></span>fairshare</div>
      <div className="auth-card"><p className="eyebrow">WELCOME</p><h2>{signup ? 'Create your account' : 'Nice to see you again'}</h2>
        <p>{signup ? 'Start sharing expenses in a minute.' : 'Sign in to pick up where you left off.'}</p>
        <button className="google" onClick={() => auth && signInWithPopup(auth, googleProvider)}><b>G</b>Continue with Google</button>
        <div className="divider"><span>or use email</span></div>
        <form onSubmit={submit}><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required /></label>
          {error && <p className="form-error">{error}</p>}<button className="primary wide">{signup ? 'Create account' : 'Sign in'}</button></form>
        <button className="text-button auth-switch" onClick={() => setSignup(!signup)}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      </div>
    </section>
  </main>
}

export function ExpenseModal({ close, initialGroup }: { close: () => void; initialGroup?: string }) {
  const { data, addExpense } = useStore()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [groupId, setGroupId] = useState(initialGroup || data.groups[0]?.id || '')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<'equal' | 'custom' | 'itemized'>('equal')
  const group = data.groups.find(item => item.id === groupId)
  const members = data.people.filter(person => group?.memberIds.includes(person.id))
  const [selected, setSelected] = useState<string[]>(group?.memberIds || [])
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [items, setItems] = useState<DraftExpenseItem[]>([{ id: crypto.randomUUID(), name: '', amount: '', participantIds: group?.memberIds || [] }])
  const [tipPercent, setTipPercent] = useState('')

  function allocate(total: number, ids: string[]): ExpenseSplit[] {
    if (!ids.length) return []
    const cents = Math.round(total * 100)
    const base = Math.floor(cents / ids.length)
    const remainder = cents - base * ids.length
    return ids.map((personId, index) => ({ personId, amount: (base + (index < remainder ? 1 : 0)) / 100 }))
  }

  function calculateItemizedAllocation(draftItems: DraftExpenseItem[], calculatedTip: number) {
    const baseCents: Record<string, number> = {}
    draftItems.forEach(item => allocate(Number(item.amount) || 0, item.participantIds).forEach(split => {
      baseCents[split.personId] = (baseCents[split.personId] || 0) + Math.round(split.amount * 100)
    }))

    const entries = Object.entries(baseCents)
    const subtotalCents = entries.reduce((sum, [, cents]) => sum + cents, 0)
    const tipCents = Math.round(calculatedTip * 100)
    const tipAllocations = entries.map(([personId, cents]) => {
      const exact = subtotalCents ? tipCents * cents / subtotalCents : 0
      return { personId, cents: Math.floor(exact), fraction: exact - Math.floor(exact) }
    })
    let remainder = tipCents - tipAllocations.reduce((sum, split) => sum + split.cents, 0)
    tipAllocations.sort((a, b) => b.fraction - a.fraction)
    tipAllocations.forEach(split => {
      if (remainder > 0) { split.cents += 1; remainder -= 1 }
    })
    const tipByPerson = Object.fromEntries(tipAllocations.map(split => [split.personId, split.cents]))
    return entries.map(([personId, cents]) => ({
      personId,
      amount: (cents + (tipByPerson[personId] || 0)) / 100,
      tipAmount: (tipByPerson[personId] || 0) / 100,
    }))
  }

  function changeGroup(nextId: string) {
    const nextGroup = data.groups.find(item => item.id === nextId)
    const ids = nextGroup?.memberIds || []
    setGroupId(nextId)
    setSelected(ids)
    setPaidBy(ids.includes(paidBy) ? paidBy : ids[0] || 'you')
    setCustomAmounts({})
    setItems([{ id: crypto.randomUUID(), name: '', amount: '', participantIds: ids }])
    setTipPercent('')
  }

  function toggleSelected(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function updateItem(id: string, patch: Partial<DraftExpenseItem>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function toggleItemPerson(itemId: string, personId: string) {
    const item = items.find(entry => entry.id === itemId)
    if (!item) return
    updateItem(itemId, { participantIds: item.participantIds.includes(personId) ? item.participantIds.filter(id => id !== personId) : [...item.participantIds, personId] })
  }

  const numericAmount = Number(amount) || 0
  const itemSubtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const numericTipPercent = Math.max(0, Number(tipPercent) || 0)
  const tipAmount = Math.round(itemSubtotal * numericTipPercent) / 100
  const itemTotal = Math.round((itemSubtotal + tipAmount) * 100) / 100
  const itemizedAllocation = calculateItemizedAllocation(items, tipAmount)
  const total = mode === 'itemized' ? itemTotal : numericAmount
  const customTotal = members.reduce((sum, person) => sum + (Number(customAmounts[person.id]) || 0), 0)
  const itemizedValid = items.length > 0 && items.every(item => item.name.trim() && Number(item.amount) > 0 && item.participantIds.length > 0)
  const valid = Boolean(description.trim() && total > 0 && (mode === 'equal' ? selected.length : mode === 'custom' ? Math.abs(customTotal - numericAmount) < .01 && customTotal > 0 : itemizedValid))

  if (!data.groups.length) return <div className="modal-backdrop"><div className="modal compact">
    <div className="modal-head"><div><p className="eyebrow">NEW EXPENSE</p><h2>Create a group first</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <p className="modal-copy">Expenses belong to groups. Create one from the sidebar, then add your first shared expense.</p>
    <button type="button" className="primary wide" onClick={close}>Got it</button>
  </div></div>

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!group || !valid) return
    let splits: ExpenseSplit[] = []
    if (mode === 'equal') splits = allocate(total, selected)
    if (mode === 'custom') splits = members.map(person => ({ personId: person.id, amount: Number(customAmounts[person.id]) || 0 })).filter(split => split.amount > 0)
    if (mode === 'itemized') {
      splits = itemizedAllocation.map(({ personId, amount: splitAmount }) => ({ personId, amount: splitAmount }))
    }
    const savedItems = mode === 'itemized' ? items.map(item => ({ ...item, amount: Number(item.amount) })) : undefined
    addExpense({ description, amount: total, groupId, paidBy, participantIds: splits.map(split => split.personId), splits, splitMode: mode, items: savedItems, tipPercent: mode === 'itemized' && numericTipPercent ? numericTipPercent : undefined, tipAmount: mode === 'itemized' && tipAmount ? tipAmount : undefined, date, category: mode === 'itemized' ? 'Food' : 'General' })
    close()
  }

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
    <form className="modal expense-modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW EXPENSE</p><h2>Add an expense</h2></div>
      <button type="button" className="icon-button" onClick={close}><X /></button></div>
      <label>What was it for?<input autoFocus value={description} onChange={e => setDescription(e.target.value)} placeholder="Dinner, tickets, groceries…" required /></label>
      <div className="form-grid"><label>Group<select value={groupId} onChange={e => changeGroup(e.target.value)}>{data.groups.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select></label>
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div>
      <label>Paid by<select value={paidBy} onChange={e => setPaidBy(e.target.value)}>{members.map(person => <option key={person.id} value={person.id}>{person.id === 'you' ? 'You' : person.name}</option>)}</select></label>
      <div className="split-tabs"><button type="button" className={mode === 'equal' ? 'active' : ''} onClick={() => setMode('equal')}>Equal</button><button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Custom</button><button type="button" className={mode === 'itemized' ? 'active' : ''} onClick={() => setMode('itemized')}>Itemized</button></div>

      {mode !== 'itemized' && <label>Bill total<div className="amount-input"><span>$</span><input inputMode="decimal" value={amount} onChange={e => updateDecimal(e.target.value, setAmount)} onBlur={() => finishDecimal(amount, setAmount)} placeholder="0.00" required /></div></label>}

      {mode === 'equal' && <div className="ledger-panel"><div className="ledger-heading"><b>Who was included?</b><span>{selected.length} selected</span></div><div className="participant-grid">{members.map(person => <button type="button" className={selected.includes(person.id) ? 'selected' : ''} onClick={() => toggleSelected(person.id)} key={person.id}><Avatar person={person} small /><span>{person.id === 'you' ? 'You' : person.name}</span><i>{selected.includes(person.id) && <Check />}</i></button>)}</div>{selected.length > 0 && numericAmount > 0 && <div className="ledger-total"><span>{money(numericAmount)} split {selected.length} ways</span><strong>{money(numericAmount / selected.length)} each</strong></div>}</div>}

      {mode === 'custom' && <div className="ledger-panel"><div className="ledger-heading"><b>Enter each person’s share</b><span>{money(customTotal)} of {money(numericAmount)}</span></div><div className="custom-splits">{members.map(person => <label key={person.id}><Avatar person={person} small /><span>{person.id === 'you' ? 'You' : person.name}</span><div><b>$</b><input inputMode="decimal" value={customAmounts[person.id] || ''} onChange={e => updateDecimal(e.target.value, next => setCustomAmounts(current => ({ ...current, [person.id]: next })))} onBlur={() => finishDecimal(customAmounts[person.id] || '', next => setCustomAmounts(current => ({ ...current, [person.id]: next })))} placeholder="0.00" /></div></label>)}</div>{numericAmount > 0 && Math.abs(customTotal - numericAmount) >= .01 && <p className="ledger-error">{customTotal < numericAmount ? `${money(numericAmount - customTotal)} left to assign` : `${money(customTotal - numericAmount)} over the bill total`}</p>}</div>}

      {mode === 'itemized' && <div className="ledger-panel itemized-panel"><div className="ledger-heading"><b>Receipt items</b><strong>{money(itemSubtotal)}</strong></div>{items.map((item, index) => <div className="receipt-item" key={item.id}><div className="receipt-line"><span>{index + 1}</span><input value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} placeholder="Burger, shared fries…" /><div className="receipt-price"><b>$</b><input inputMode="decimal" value={item.amount} onChange={e => updateDecimal(e.target.value, next => updateItem(item.id, { amount: next }))} onBlur={() => finishDecimal(item.amount, next => updateItem(item.id, { amount: next }))} placeholder="0.00" /></div>{items.length > 1 && <button type="button" className="icon-button remove-item" onClick={() => setItems(current => current.filter(entry => entry.id !== item.id))}><Trash2 /></button>}</div><div className="item-people"><small>Assign to</small>{members.map(person => <button type="button" title={person.name} className={item.participantIds.includes(person.id) ? 'selected' : ''} onClick={() => toggleItemPerson(item.id, person.id)} key={person.id}><Avatar person={person} small /></button>)}</div></div>)}<button type="button" className="add-line" onClick={() => setItems(current => [...current, { id: crypto.randomUUID(), name: '', amount: '', participantIds: group?.memberIds || [] }])}><Plus />Add receipt item</button><div className="tip-section"><div className="tip-heading"><div><b>Add tip</b><small>Split by each person’s assigned items</small></div><strong>{money(tipAmount)}</strong></div><div className="tip-controls"><button type="button" className={!tipPercent ? 'active' : ''} onClick={() => setTipPercent('')}>None</button>{[15, 18, 20, 25].map(percent => <button type="button" className={numericTipPercent === percent ? 'active' : ''} onClick={() => setTipPercent(String(percent))} key={percent}>{percent}%</button>)}<label><input aria-label="Custom tip percentage" inputMode="decimal" value={tipPercent} onChange={e => updateDecimal(e.target.value, setTipPercent)} placeholder="Custom" /><span>%</span></label></div>{numericTipPercent > 0 && itemizedAllocation.length > 0 && <div className="tip-breakdown">{itemizedAllocation.map(split => { const person = members.find(member => member.id === split.personId); return <span key={split.personId}>{split.personId === 'you' ? 'You' : person?.name}: +{money(split.tipAmount)}</span> })}</div>}</div><p className="itemized-hint">Tax or Uber fees can still be added as receipt items and assigned to the right people.</p></div>}

      <div className="expense-submit"><div><span>Total</span><strong>{money(total)}</strong></div><button className="primary" disabled={!valid}>Add expense</button></div>
    </form>
  </div>
}

export function SettleModal({ close }: { close: () => void }) {
  const { data, addExpense } = useStore()
  const [who, setWho] = useState(data.people.find(person => person.id !== 'you')?.id || '')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'received' | 'sent'>('received')
  const person = data.people.find(item => item.id === who)

  if (data.people.length < 2) return <div className="modal-backdrop"><div className="modal compact">
    <div className="modal-head"><div><p className="eyebrow">SETTLE UP</p><h2>No balances yet</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <p className="modal-copy">Once you share an expense with someone, their balance will appear here.</p>
    <button type="button" className="primary wide" onClick={close}>Got it</button>
  </div></div>

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!amount) return
    addExpense({ description: `Payment with ${person?.name}`, amount: Number(amount), groupId: data.groups[0]?.id || 'direct', paidBy: direction === 'received' ? who : currentUserId, participantIds: [who], date: new Date().toISOString().slice(0, 10), category: 'Payment', kind: 'settlement' })
    close()
  }

  return <div className="modal-backdrop"><form className="modal compact" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">SETTLE UP</p><h2>Record a payment</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <label>With<select value={who} onChange={e => setWho(e.target.value)}>{data.people.filter(person => person.id !== 'you').map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
    <label>What happened?<select value={direction} onChange={e => setDirection(e.target.value as 'received' | 'sent')}><option value="received">They paid you</option><option value="sent">You paid them</option></select></label>
    <label>Amount<div className="amount-input"><span>$</span><input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required /></div></label>
    <button className="primary wide">Record payment</button>
  </form></div>
}

export function GroupModal({ close }: { close: () => void }) {
  const { data, addGroup } = useStore()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✨')
  const [members, setMembers] = useState<string[]>(['you'])

  function toggle(id: string) {
    setMembers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    addGroup({ name, emoji, memberIds: members, color: '#e3eee9' })
    close()
  }

  return <div className="modal-backdrop"><form className="modal compact" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">NEW GROUP</p><h2>Bring everyone together</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <div className="group-name-fields"><label>Emoji<input value={emoji} maxLength={2} onChange={e => setEmoji(e.target.value)} /></label><label>Group name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Summer road trip" required /></label></div>
    <p className="field-label">ADD FRIENDS</p><div className="member-picker">{data.people.filter(person => person.id !== 'you').map(person => <button type="button" className={members.includes(person.id) ? 'selected' : ''} onClick={() => toggle(person.id)} key={person.id}><Avatar person={person} small /><span>{person.name}</span><i>{members.includes(person.id) && <Check />}</i></button>)}</div>
    <button className="primary wide">Create group</button>
  </form></div>
}

export function FriendModal({ close }: { close: () => void }) {
  const { addPerson } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [added, setAdded] = useState(false)
  const [inviteError, setInviteError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (added) { close(); return }
    setSubmitting(true)
    setInviteError('')
    const personInitials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    const colors = ['#5577d1', '#ee7b57', '#c173b0', '#c4902f', '#5d8c87']
    addPerson({ name, email, initials: personInitials || '?', color: colors[name.length % colors.length] })
    setAdded(true)
    if (!invite) { close(); return }
    try {
      await sendFriendInvite(name, email)
      close()
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'The invitation could not be sent.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop"><form className="modal compact" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">NEW FRIEND</p><h2>Add someone you trust</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <label>Name<input disabled={added} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Taylor Kim" required /></label>
    <label>Email<input disabled={added} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="taylor@example.com" required /></label>
    {!added && <label className="invite-toggle"><input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)} /><span><b>Send an email invitation</b><small>They’ll receive a link to join Fairshare.</small></span></label>}
    {inviteError && <div className="invite-warning"><b>Friend added, but the email wasn’t sent.</b><span>{inviteError}</span></div>}
    {!inviteError && <p className="modal-copy small-copy">This adds them to your workspace so you can include them in groups and shared expenses.</p>}
    <button className="primary wide" disabled={submitting}>{submitting ? 'Sending invitation…' : added ? 'Close' : 'Add friend'}</button>
  </form></div>
}

export function GroupMembersModal({ groupId, close }: { groupId: string; close: () => void }) {
  const { data, updateGroupMembers } = useStore()
  const group = data.groups.find(item => item.id === groupId)
  const [members, setMembers] = useState<string[]>(group?.memberIds || ['you'])

  function toggle(id: string) {
    setMembers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    updateGroupMembers(groupId, Array.from(new Set(['you', ...members])))
    close()
  }

  return <div className="modal-backdrop"><form className="modal compact" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">GROUP MEMBERS</p><h2>{group?.emoji} {group?.name}</h2></div><button type="button" className="icon-button" onClick={close}><X /></button></div>
    <div className="owner-row"><Avatar person={data.people.find(person => person.id === 'you')} small /><span><b>You</b><small>Group owner</small></span><i><Check /></i></div>
    {data.people.length > 1 ? <div className="member-picker edit-members">{data.people.filter(person => person.id !== 'you').map(person => <button type="button" className={members.includes(person.id) ? 'selected' : ''} onClick={() => toggle(person.id)} key={person.id}><Avatar person={person} small /><span>{person.name}<small>{person.email}</small></span><i>{members.includes(person.id) && <Check />}</i></button>)}</div> :
      <div className="no-friends-note">Add friends from the Friends page before inviting them to this group.</div>}
    <p className="modal-copy small-copy">Changes apply to future expenses. Existing expenses keep their original participants and split amounts.</p>
    <button className="primary wide">Save members</button>
  </form></div>
}
