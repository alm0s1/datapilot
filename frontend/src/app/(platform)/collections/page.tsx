"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { collectionApi } from "@/lib/api/collections";
import { queryApi } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Collection } from "@/types/collection";
import {
  Plus,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  FolderPlus,
} from "lucide-react";

function CollectionTreeNode({
  collection,
  level,
  onSelect,
  selectedId,
  onCreateChild,
  onDelete,
  onRename,
}: {
  collection: Collection;
  level: number;
  onSelect: (id: string) => void;
  selectedId: string | null;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (collection: Collection) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const [showMenu, setShowMenu] = useState(false);

  const { data: children } = useQuery({
    queryKey: ["collections", collection.id],
    queryFn: () => collectionApi.list(collection.id),
    enabled: expanded,
  });

  const { data: queries } = useQuery({
    queryKey: ["queries", { collection_id: collection.id }],
    queryFn: () => queryApi.list(collection.id),
    enabled: expanded,
  });

  const isSelected = selectedId === collection.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/80 ${
          isSelected ? "bg-primary/10 text-primary" : ""
        }`}
        style={{ paddingInlineStart: `${level * 16 + 8}px` }}
        onClick={() => onSelect(collection.id)}
      >
        <button
          className="shrink-0 p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {expanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        )}
        <span className="flex-1 truncate">{collection.name}</span>
        <div className="relative">
          <button
            className="rounded p-0.5 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setShowMenu(false)}
              />
              <div className="fixed z-[101] w-40 rounded-md border bg-popover p-1 shadow-md" style={{ marginTop: "4px" }}>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onCreateChild(collection.id);
                  }}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Subfolder
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onRename(collection);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-destructive hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete(collection.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div>
          {children?.map((child) => (
            <CollectionTreeNode
              key={child.id}
              collection={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
          {queries?.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50"
              style={{ paddingInlineStart: `${(level + 1) * 16 + 24}px` }}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{q.name}</span>
              <span className="ms-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                {q.query_type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>(
    undefined
  );
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);

  const { data: rootCollections, isLoading } = useQuery({
    queryKey: ["collections", null],
    queryFn: () => collectionApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; parent_id?: string }) =>
      collectionApi.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setShowCreateDialog(false);
      setNewName("");
      setNewDescription("");
      setCreateParentId(undefined);
      toast.success("Collection created", {
        description: `"${variables.name}" has been created successfully.`,
      });
    },
    onError: (err) => {
      toast.error("Failed to create collection", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => collectionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setSelectedId(null);
      toast.success("Collection deleted");
    },
    onError: (err) => {
      toast.error("Failed to delete collection", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      collectionApi.update(id, { name }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditingCollection(null);
      setNewName("");
      toast.success("Collection renamed", {
        description: `Renamed to "${variables.name}"`,
      });
    },
    onError: (err) => {
      toast.error("Failed to rename collection", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    },
  });

  const handleCreateChild = useCallback((parentId: string) => {
    setCreateParentId(parentId);
    setShowCreateDialog(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setCollectionToDelete(id);
      setDeleteDialogOpen(true);
    },
    []
  );

  const confirmDelete = () => {
    if (collectionToDelete) {
      deleteMutation.mutate(collectionToDelete);
    }
    setDeleteDialogOpen(false);
    setCollectionToDelete(null);
  };

  const handleRename = useCallback((collection: Collection) => {
    setEditingCollection(collection);
    setNewName(collection.name);
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Tree Panel */}
      <div className="w-80 shrink-0 overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t.collection.title}</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreateParentId(undefined);
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-1" style={{ maxHeight: "calc(100% - 3rem)" }}>
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : rootCollections?.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-2 h-8 w-8" />
              <p>No collections yet</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="me-1 h-3 w-3" />
                Create first collection
              </Button>
            </div>
          ) : (
            rootCollections?.map((col) => (
              <CollectionTreeNode
                key={col.id}
                collection={col}
                level={0}
                onSelect={setSelectedId}
                selectedId={selectedId}
                onCreateChild={handleCreateChild}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1">
        {selectedId ? (
          <CollectionDetail collectionId={selectedId} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Folder className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p className="text-sm">Select a collection to view its contents</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t.collection.new}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewName("");
                  setNewDescription("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      createMutation.mutate({
                        name: newName,
                        description: newDescription || undefined,
                        parent_id: createParentId,
                      });
                    }
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description (optional)
                </label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What is this collection for?"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setNewName("");
                    setNewDescription("");
                  }}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      name: newName,
                      description: newDescription || undefined,
                      parent_id: createParentId,
                    })
                  }
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {t.common.create}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rename Dialog */}
      {editingCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Rename Collection</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingCollection(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    renameMutation.mutate({
                      id: editingCollection.id,
                      name: newName,
                    });
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingCollection(null)}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  onClick={() =>
                    renameMutation.mutate({
                      id: editingCollection.id,
                      name: newName,
                    })
                  }
                  disabled={!newName.trim()}
                >
                  {t.common.save}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this collection? This action cannot be undone and will remove all subcollections and queries within it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CollectionDetail({ collectionId }: { collectionId: string }) {
  const t = useTranslations();

  const { data: collection } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => collectionApi.get(collectionId),
  });

  const { data: children } = useQuery({
    queryKey: ["collections", collectionId],
    queryFn: () => collectionApi.list(collectionId),
  });

  const { data: queries } = useQuery({
    queryKey: ["queries", { collection_id: collectionId }],
    queryFn: () => queryApi.list(collectionId),
  });

  if (!collection) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{collection.name}</h1>
        {collection.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {collection.description}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Created {new Date(collection.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Sub-collections */}
      {children && children.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">
            Subcollections ({children.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <Card key={child.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="flex items-center gap-3 p-4">
                  <Folder className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{child.name}</p>
                    {child.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {child.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Queries */}
      {queries && queries.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">
            Queries ({queries.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queries.map((q) => (
              <Card key={q.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="flex items-center gap-3 p-4">
                  <FileText className="h-6 w-6 text-blue-500" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{q.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.query_type} &middot;{" "}
                      {new Date(q.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(!children || children.length === 0) &&
        (!queries || queries.length === 0) && (
          <Card className="py-8 text-center">
            <CardContent>
              <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                This collection is empty
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
