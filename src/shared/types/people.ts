export type PersonTrust = 'Verified' | 'Known' | 'New'

export interface PersonItem {
  id: string
  name: string
  trust: PersonTrust
  lastSeen: string
}
