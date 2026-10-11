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
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRsbuild, loadConfig } from '@rsbuild/core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { content } = await loadConfig({ cwd: root })
const rsbuild = await createRsbuild({
  cwd: root,
  rsbuildConfig: {
    ...content,
    source: {
      ...content.source,
      entry: { index: './src/features/consumption-summary/preview.tsx' },
    },
    server: { host: '127.0.0.1', port: 3101, strictPort: true },
  },
})
await rsbuild.startDevServer()
