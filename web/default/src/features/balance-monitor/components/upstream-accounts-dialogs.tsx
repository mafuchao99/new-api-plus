/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { AlertSettingsDialog } from './alert-settings-dialog'
import { MonitorSettingsDialog } from './monitor-settings-dialog'
import { UpstreamAccountsDeleteDialog } from './upstream-accounts-delete-dialog'
import { UpstreamAccountsMutateDrawer } from './upstream-accounts-mutate-drawer'
import { useUpstreamAccounts } from './upstream-accounts-provider'

export function UpstreamAccountsDialogs() {
  const { open, setOpen, currentRow } = useUpstreamAccounts()
  const isUpdate = open === 'update'

  return (
    <>
      <UpstreamAccountsMutateDrawer
        open={open === 'create' || isUpdate}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={isUpdate ? currentRow || undefined : undefined}
      />
      <UpstreamAccountsDeleteDialog />
      <AlertSettingsDialog />
      <MonitorSettingsDialog />
    </>
  )
}
