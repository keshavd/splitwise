import { useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import { ArrowDownLeft, ArrowUpRight, Bell, Check, ChevronDown, CircleDollarSign, Home, LogOut, Menu, Plus, Search, Settings, Sparkles, UserPlus, Users } from 'lucide-react'
import { auth } from './firebase'
import { useStore } from './store'
import { AuthScreen, Avatar, ExpenseModal, FriendModal, GroupMembersModal, GroupModal, money, SettleModal } from './components'

const shortDate = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
const categoryIcons: Record<string, string> = { Food: '🍜', Home: '🏠', Stay: '🛏️', Transport: '🚗', Utilities: '💡', Shopping: '🛍️' }

function App() {
  const { data, user, loading, cloud } = useStore()
  const [active, setActive] = useState('dashboard')
  const [modal, setModal] = useState<'expense' | 'settle' | 'group' | 'friend' | 'members' | null>(null)
  const [search, setSearch] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const peopleById = useMemo(() => Object.fromEntries(data.people.map(person => [person.id, person])), [data.people])

  const balances = useMemo(() => {
    const result: Record<string, number> = {}
    data.people.forEach(person => { result[person.id] = 0 })
    data.expenses.forEach(expense => {
      if (expense.kind === 'settlement') {
        const otherId = expense.participantIds[0]
        if (expense.paidBy === 'you') result[otherId] = (result[otherId] || 0) + expense.amount
        else result[expense.paidBy] = (result[expense.paidBy] || 0) - expense.amount
        return
      }
      const splits = expense.splits?.length ? expense.splits : expense.participantIds.map(personId => ({ personId, amount: expense.amount / expense.participantIds.length }))
      if (expense.paidBy === 'you') {
        splits.filter(split => split.personId !== 'you').forEach(split => { result[split.personId] += split.amount })
      } else {
        const yourSplit = splits.find(split => split.personId === 'you')
        if (yourSplit) result[expense.paidBy] -= yourSplit.amount
      }
    })
    return result
  }, [data])

  const totalOwed = Object.entries(balances).filter(([id, amount]) => id !== 'you' && amount > 0).reduce((sum, [, amount]) => sum + amount, 0)
  const totalOwe = Math.abs(Object.entries(balances).filter(([id, amount]) => id !== 'you' && amount < 0).reduce((sum, [, amount]) => sum + amount, 0))
  const selectedGroup = data.groups.find(group => group.id === active)
  const isFriends = active === 'friends'
  const currentPerson = data.people.find(person => person.id === 'you') || data.people[0]
  const firstName = currentPerson?.name.split(' ')[0] || 'there'
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  const visibleExpenses = data.expenses
    .filter(expense => expense.kind !== 'settlement' && (active === 'dashboard' || expense.groupId === active) && expense.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))

  if (loading) return <div className="loading"><span className="brandmark"><CircleDollarSign /></span></div>
  if (cloud && !user) return <AuthScreen />

  return <div className="app-shell">
    <aside className={sidebar ? 'open' : ''}>
      <div className="brand"><span className="brandmark"><CircleDollarSign /></span>fairshare</div>
      <nav>
        <button className={active === 'dashboard' ? 'active' : ''} onClick={() => { setActive('dashboard'); setSidebar(false) }}><Home />Overview</button>
        <button className={isFriends ? 'active' : ''} onClick={() => { setActive('friends'); setSidebar(false) }}><Users />Friends<span className="nav-count">{data.people.length - 1}</span></button>
        <p className="nav-label">YOUR GROUPS</p>
        {data.groups.map(group => <button key={group.id} className={active === group.id ? 'active' : ''} onClick={() => { setActive(group.id); setSidebar(false) }}>
          <span className="group-emoji" style={{ background: group.color }}>{group.emoji}</span><span>{group.name}</span>
        </button>)}
      </nav>
      <button className="new-group" onClick={() => setModal('group')}><Plus />Create a group</button>
      <div className="sidebar-foot"><div><Avatar person={currentPerson} /><span><b>{currentPerson?.name}</b><small>{cloud ? 'Synced with Firebase' : 'Demo workspace'}</small></span></div>
        {user && <button className="icon-button" title="Sign out" onClick={() => auth && signOut(auth)}><LogOut /></button>}
      </div>
    </aside>

    <main className="content">
      <header><button className="menu icon-button" onClick={() => setSidebar(!sidebar)}><Menu /></button>
        <div className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search expenses…" /></div>
        <div className="head-actions"><button className="icon-button notification"><Bell /><i /></button><button className="profile"><Avatar person={currentPerson} small /><ChevronDown /></button></div>
      </header>

      <div className="page">
        <section className="welcome"><div><p className="eyebrow">{isFriends ? 'YOUR PEOPLE' : selectedGroup ? 'GROUP' : todayLabel}</p>
          <h1>{isFriends ? 'Friends' : selectedGroup ? `${selectedGroup.emoji} ${selectedGroup.name}` : `Welcome back, ${firstName}`}</h1>
          <p>{isFriends ? 'The people you share expenses with.' : selectedGroup ? `${selectedGroup.memberIds.length} members sharing expenses` : 'Here’s where things stand with your people.'}</p></div>
          {isFriends ? <div className="welcome-actions"><button className="primary" onClick={() => setModal('friend')}><Plus />Add friend</button></div> :
            <div className="welcome-actions">{selectedGroup && <button className="secondary" onClick={() => setModal('members')}><UserPlus />Members</button>}<button className="secondary" onClick={() => setModal('settle')}><Check />Settle up</button><button className="primary" onClick={() => setModal('expense')}><Plus />Add expense</button></div>}
        </section>

        {active === 'dashboard' && <>
          <section className="summary-grid">
            <article className="summary-card peach"><span className="metric-icon"><ArrowDownLeft /></span><div><p>You owe</p><strong>{money(totalOwe)}</strong><small>across {Object.values(balances).filter(amount => amount < 0).length} people</small></div></article>
            <article className="summary-card mint"><span className="metric-icon"><ArrowUpRight /></span><div><p>You are owed</p><strong>{money(totalOwed)}</strong><small>across {Object.values(balances).filter(amount => amount > 0).length} people</small></div></article>
            <article className="net-card"><div><span className="spark"><Sparkles /></span><p>Overall, you are owed</p><strong>{money(totalOwed - totalOwe)}</strong></div><div className="mini-bars"><i /><i /><i /><i /><i /><i /></div></article>
          </section>
          <section className="panel balances"><div className="panel-title"><div><h2>Your balances</h2><p>A quick look at who owes what</p></div><button className="text-button">View all</button></div>
            <div className="balance-list">{Object.entries(balances).filter(([id, amount]) => id !== 'you' && amount !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([id, value]) =>
              <div className="balance-row" key={id}><Avatar person={peopleById[id]} /><div className="balance-name"><b>{peopleById[id]?.name}</b><span>{value > 0 ? 'owes you' : 'you owe'}</span></div>
                <strong className={value > 0 ? 'positive' : 'negative'}>{money(value)}</strong><button className="pill" onClick={() => setModal('settle')}>Settle</button></div>)}</div>
          </section>
        </>}

        {isFriends && <section className="friends-grid">{data.people.length > 1 ? data.people.filter(person => person.id !== 'you').map(person => {
          const balance = balances[person.id] || 0
          return <article className="friend-card" key={person.id}><div className="friend-main"><Avatar person={person} /><div><h3>{person.name}</h3><p>{person.email}</p></div></div>
            <div className="friend-balance"><span>{balance > 0 ? 'owes you' : balance < 0 ? 'you owe' : 'all settled up'}</span>{balance !== 0 && <strong className={balance > 0 ? 'positive' : 'negative'}>{money(balance)}</strong>}</div>
            <div className="friend-actions"><button className="secondary" onClick={() => setModal('expense')}><Plus />Expense</button><button className="pill" onClick={() => setModal('settle')}>Settle up</button></div>
          </article>
        }) : <div className="friends-empty"><span>👋</span><h2>Add your first friend</h2><p>Friends can be added to groups, expenses, and settlements.</p><button className="primary" onClick={() => setModal('friend')}><Plus />Add friend</button></div>}</section>}

        {!isFriends && <section className="panel activity"><div className="panel-title"><div><h2>{selectedGroup ? 'Group expenses' : 'Recent activity'}</h2><p>{selectedGroup ? 'Everything shared in this group' : 'The latest across all your groups'}</p></div><button className="filter">All activity <ChevronDown /></button></div>
          <div className="activity-list">{visibleExpenses.length ? visibleExpenses.slice(0, 8).map(expense => <article className="expense-row" key={expense.id}>
            <div className="date-tile"><b>{shortDate(expense.date).split(' ')[0]}</b><span>{shortDate(expense.date).split(' ')[1]}</span></div>
            <span className="expense-icon">{categoryIcons[expense.category] || '🧾'}</span>
            <div className="expense-info"><b>{expense.description}</b><span>{data.groups.find(group => group.id === expense.groupId)?.name} · Paid by {expense.paidBy === 'you' ? 'you' : peopleById[expense.paidBy]?.name}{expense.splitMode === 'itemized' ? ' · Itemized' : ''}</span></div>
            <div className="expense-amount"><strong>{money(expense.amount)}</strong><span>{(() => { const yourAmount = expense.splits?.find(split => split.personId === 'you')?.amount ?? (expense.participantIds.includes('you') ? expense.amount / expense.participantIds.length : 0); return yourAmount ? (expense.paidBy === 'you' ? `your share ${money(yourAmount)}` : `you owe ${money(yourAmount)}`) : 'not involved' })()}</span></div>
          </article>) : <div className="empty"><span>🔎</span><h3>No expenses found</h3><p>Try another search or add a new expense.</p></div>}</div>
        </section>}
      </div>
      <footer><span>Fairshare · Built for good friends</span><button><Settings />Preferences</button></footer>
    </main>
    {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
    {modal === 'expense' && <ExpenseModal close={() => setModal(null)} initialGroup={selectedGroup?.id} />}
    {modal === 'settle' && <SettleModal close={() => setModal(null)} />}
    {modal === 'group' && <GroupModal close={() => setModal(null)} />}
    {modal === 'friend' && <FriendModal close={() => setModal(null)} />}
    {modal === 'members' && selectedGroup && <GroupMembersModal groupId={selectedGroup.id} close={() => setModal(null)} />}
  </div>
}

export default App
