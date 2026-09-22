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
import { useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import type { UpstreamAccountFormValues } from '../lib/upstream-account-form'

export function UpstreamAccountAuthFields(props: {
  control: Control<UpstreamAccountFormValues>
}) {
  const { t } = useTranslation()
  const authType = useWatch({ control: props.control, name: 'auth_type' })

  return (
    <>
      <FormField
        control={props.control}
        name='auth_type'
        render={({ field }) => (
          <FormItem className='space-y-3 rounded-lg border p-4'>
            <FormLabel>{t('Authentication method')}</FormLabel>
            <FormControl>
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant={
                    field.value === 'access_token' ? 'default' : 'outline'
                  }
                  onClick={() => field.onChange('access_token')}
                >
                  {t('Access Token')}
                </Button>
                <Button
                  type='button'
                  variant={field.value === 'password' ? 'default' : 'outline'}
                  onClick={() => field.onChange('password')}
                >
                  {t('Username + Password')}
                </Button>
              </div>
            </FormControl>
            <FormDescription>
              {t(
                'Credentials are stored server-side and used only for balance queries.'
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {authType === 'access_token' ? (
        <FormField
          control={props.control}
          name='access_token'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Access Token')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='password'
                  autoComplete='off'
                  placeholder='sk-...'
                />
              </FormControl>
              <FormDescription>
                {t('System access token used to query the upstream balance.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <>
          <FormField
            control={props.control}
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Username')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete='off' />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.control}
            name='password'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Password')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='password'
                    autoComplete='new-password'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </>
  )
}
