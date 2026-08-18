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
import { Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

export function CopyableModelName(props: {
  value: string
  className?: string
}) {
  const { t } = useTranslation()

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const copied = await copyToClipboard(props.value)
    if (copied) {
      toast.success(t('Copied to clipboard'))
      return
    }
    toast.error(t('Failed to copy to clipboard'))
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      title={t('Copy model name')}
      aria-label={`${t('Copy model name')}: ${props.value}`}
      className={cn(
        'group/model-name focus-visible:ring-ring inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-offset-2',
        props.className
      )}
    >
      <span className='truncate'>{props.value}</span>
      <HugeiconsIcon
        icon={Copy01Icon}
        data-icon='inline-end'
        aria-hidden='true'
        className='text-muted-foreground/50 group-hover/model-name:text-foreground size-3.5 shrink-0 transition-colors'
        strokeWidth={2}
      />
    </button>
  )
}
