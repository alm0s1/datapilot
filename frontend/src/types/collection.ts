export interface Collection {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface CollectionCreate {
  name: string;
  description?: string;
  parent_id?: string;
}
