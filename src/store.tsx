import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, db, firebaseEnabled } from './firebase'
import { seed } from './data'
import type { Workspace, Expense, Group, Person } from './types'

type Store = {
  data: Workspace
  user: User | null
  loading: boolean
  cloud: boolean
  addExpense: (expense: Omit<Expense, 'id'>) => void
  addGroup: (group: Omit<Group, 'id'>) => void
  addPerson: (person: Omit<Person, 'id'>) => void
  updateGroupMembers: (groupId: string, memberIds: string[]) => void
}

const StoreContext = createContext<Store | null>(null)
const localKey = 'fairshare-workspace-v1'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'ME'
}

function createWorkspace(account: User): Workspace {
  const name = account.displayName || account.email?.split('@')[0] || 'You'
  return {
    people: [{ id: 'you', name, email: account.email || '', initials: initials(name), color: '#1f8a70' }],
    groups: [],
    expenses: [],
  }
}

function isUntouchedDemo(workspace: Workspace) {
  return workspace.people?.length === seed.people.length
    && workspace.groups?.length === seed.groups.length
    && workspace.expenses?.length === seed.expenses.length
    && seed.expenses.every(expense => workspace.expenses.some(item => item.id === expense.id))
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(() => {
    try { return JSON.parse(localStorage.getItem(localKey) || '') as Workspace }
    catch { return seed }
  })
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(firebaseEnabled)
  const [hydrated, setHydrated] = useState(!firebaseEnabled)

  useEffect(() => {
    if (!auth || !db) {
      return
    }
    let stopSnapshot = () => {}
    const stopAuth = onAuthStateChanged(auth, account => {
      stopSnapshot()
      setUser(account)
      if (!account) {
        setLoading(false)
        setHydrated(false)
        return
      }
      setLoading(true)
      const ref = doc(db!, 'workspaces', account.uid)
      stopSnapshot = onSnapshot(ref, snapshot => {
        if (snapshot.exists()) {
          const workspace = snapshot.data() as Workspace
          if (isUntouchedDemo(workspace)) {
            const cleanWorkspace = createWorkspace(account)
            setData(cleanWorkspace)
            void setDoc(ref, cleanWorkspace)
          } else setData(workspace)
        } else {
          const cleanWorkspace = createWorkspace(account)
          setData(cleanWorkspace)
          void setDoc(ref, cleanWorkspace)
        }
        setHydrated(true)
        setLoading(false)
      })
    })
    return () => { stopAuth(); stopSnapshot() }
  }, [])

  useEffect(() => {
    localStorage.setItem(localKey, JSON.stringify(data))
    if (db && user && hydrated) void setDoc(doc(db, 'workspaces', user.uid), data)
  }, [data, user, hydrated])

  const value = useMemo<Store>(() => ({
    data,
    user,
    loading,
    cloud: firebaseEnabled,
    addExpense: expense => setData(current => ({
      ...current,
      expenses: [{ ...expense, id: crypto.randomUUID() }, ...current.expenses],
    })),
    addGroup: group => setData(current => ({
      ...current,
      groups: [...current.groups, { ...group, id: crypto.randomUUID() }],
    })),
    addPerson: person => setData(current => ({
      ...current,
      people: [...current.people, { ...person, id: crypto.randomUUID() }],
    })),
    updateGroupMembers: (groupId, memberIds) => setData(current => ({
      ...current,
      groups: current.groups.map(group => group.id === groupId ? { ...group, memberIds } : group),
    })),
  }), [data, user, loading])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('StoreProvider is missing')
  return value
}
