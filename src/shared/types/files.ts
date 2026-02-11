export interface FileItem {
  id: string
  name: string
  kind: 'Document' | 'Image' | 'Audio' | 'Archive' | 'Note'
  sizeLabel: string
  owner: string
}
