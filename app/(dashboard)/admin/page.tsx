"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { ShieldCheck, RefreshCw } from "lucide-react";

import { getAdminUserService } from "@/services/admin/admin.service";
import type { AdminUser } from "@/services/admin/admin.types";

import { UserStatsBar } from "@/components/admin/UserStatsBar";
import { UsersTable } from "@/components/admin/UsersTable";
import { EditUserModal } from "@/components/admin/EditUserModal";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Toast } from "@/components/ui/Toast";
import type { ToastType } from "@/components/ui/Toast";

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  function showToast(msg: string, type: ToastType = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAdminUserService().listUsers();
      setUsers(list);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const coaches = users.filter((u) => u.role === "coach");

  async function handleDeleteUser(user: AdminUser) {
    await getAdminUserService().deleteUser(user.id);
    showToast("User deleted successfully");
    fetchUsers();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-violet-400" />
            Admin Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage swimmers and coaches</p>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats */}
      <UserStatsBar users={users} />

      {/* Users table with search / filter / create */}
      <UsersTable
        users={users}
        loading={loading}
        onEdit={setEditUser}
        onDelete={setDeleteUser}
        onCreateNew={() => setShowCreate(true)}
      />

      {/* Modals */}
      <AnimatePresence>
        {editUser && (
          <EditUserModal
            user={editUser}
            coaches={coaches}
            onClose={() => setEditUser(null)}
            onSaved={() => { setEditUser(null); fetchUsers(); }}
            showToast={showToast}
          />
        )}
        {deleteUser && (
          <ConfirmModal
            title="Delete User?"
            description={
              <>Delete <span className="text-white font-medium">{deleteUser.name}</span> ({deleteUser.email})?</>
            }
            warning={
              deleteUser.sessionCount > 0
                ? `${deleteUser.sessionCount} session${deleteUser.sessionCount > 1 ? "s" : ""} will also be deleted.`
                : undefined
            }
            onClose={() => setDeleteUser(null)}
            onConfirm={async () => { await handleDeleteUser(deleteUser); setDeleteUser(null); }}
          />
        )}
        {showCreate && (
          <CreateUserModal
            coaches={coaches}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); fetchUsers(); }}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
