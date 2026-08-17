export type Person = { id: string; name: string; email: string; color: string; initials: string }
export type Group = { id: string; name: string; emoji: string; memberIds: string[]; color: string }
export type ExpenseSplit = { personId: string; amount: number }
export type ExpenseItem = { id: string; name: string; amount: number; participantIds: string[] }
export type Expense = {
  id: string
  groupId: string
  description: string
  amount: number
  paidBy: string
  participantIds: string[]
  date: string
  category: string
  note?: string
  kind?: 'expense' | 'settlement'
  splitMode?: 'equal' | 'custom' | 'itemized'
  splits?: ExpenseSplit[]
  items?: ExpenseItem[]
}
export type Workspace = { people: Person[]; groups: Group[]; expenses: Expense[] }
