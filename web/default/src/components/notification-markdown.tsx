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
import { Markdown } from '@/components/ui/markdown'

type NotificationMarkdownProps = {
  children: string
}

export function NotificationMarkdown(props: NotificationMarkdownProps) {
  return (
    <Markdown
      preserveLineBreaks
      size='base'
      className='prose-headings:my-0 prose-p:my-0 prose-p:leading-7 prose-ul:my-0 prose-ol:my-0 prose-li:my-1.5 prose-blockquote:my-0 prose-pre:my-0 prose-table:my-0 prose-hr:my-0 prose-img:my-0 flex flex-col gap-4 [&_p_br]:block [&_p_br]:h-1'
    >
      {props.children}
    </Markdown>
  )
}
