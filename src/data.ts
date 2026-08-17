import type { Workspace } from './types'

export const currentUserId = 'you'

export const seed: Workspace = {
  people: [
    { id: 'you', name: 'Alex Morgan', email: 'alex@example.com', initials: 'AM', color: '#1f8a70' },
    { id: 'maya', name: 'Maya Chen', email: 'maya@example.com', initials: 'MC', color: '#ee7b57' },
    { id: 'sam', name: 'Sam Wilson', email: 'sam@example.com', initials: 'SW', color: '#5577d1' },
    { id: 'jordan', name: 'Jordan Lee', email: 'jordan@example.com', initials: 'JL', color: '#c173b0' },
    { id: 'noah', name: 'Noah Williams', email: 'noah@example.com', initials: 'NW', color: '#c4902f' },
  ],
  groups: [
    { id: 'apt', name: 'Maple Street Apt', emoji: '🏡', memberIds: ['you', 'maya', 'sam'], color: '#dceee8' },
    { id: 'portland', name: 'Portland Weekend', emoji: '🌲', memberIds: ['you', 'maya', 'jordan', 'noah'], color: '#e7ecdb' },
    { id: 'dinners', name: 'Thursday Dinners', emoji: '🍜', memberIds: ['you', 'sam', 'jordan'], color: '#f5e6dc' },
  ],
  expenses: [
    { id: 'e1', groupId: 'apt', description: 'August rent', amount: 2400, paidBy: 'you', participantIds: ['you', 'maya', 'sam'], date: '2026-08-01', category: 'Home' },
    { id: 'e2', groupId: 'portland', description: 'Cabin by the river', amount: 684, paidBy: 'maya', participantIds: ['you', 'maya', 'jordan', 'noah'], date: '2026-08-09', category: 'Stay' },
    { id: 'e3', groupId: 'portland', description: 'Gas & snacks', amount: 92.40, paidBy: 'you', participantIds: ['you', 'maya', 'jordan', 'noah'], date: '2026-08-10', category: 'Transport' },
    { id: 'e4', groupId: 'dinners', description: 'Khao Soi night', amount: 118.50, paidBy: 'jordan', participantIds: ['you', 'sam', 'jordan'], date: '2026-08-13', category: 'Food' },
    { id: 'e5', groupId: 'apt', description: 'Internet', amount: 74.99, paidBy: 'sam', participantIds: ['you', 'maya', 'sam'], date: '2026-08-14', category: 'Utilities' },
    { id: 'e6', groupId: 'apt', description: 'Kitchen restock', amount: 63.18, paidBy: 'maya', participantIds: ['you', 'maya', 'sam'], date: '2026-08-15', category: 'Shopping' },
  ],
}
