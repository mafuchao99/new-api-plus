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
import { zodResolver } from '@hookform/resolvers/zod'
import { BellRing, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { getCurrencyLabel } from '@/lib/currency'

import {
  createUpstreamAccount,
  getUpstreamAccount,
  updateUpstreamAccount,
} from '../api'
import { SUCCESS_MESSAGES, getUpstreamAccountTypeOptions } from '../constants'
import {
  UPSTREAM_ACCOUNT_FORM_DEFAULT_VALUES,
  getUpstreamAccountFormSchema,
  transformAccountToFormDefaults,
  transformFormDataToPayload,
  type UpstreamAccountFormValues,
} from '../lib/upstream-account-form'
import type { UpstreamAccount } from '../types'
import { UpstreamAccountAuthFields } from './upstream-account-auth-fields'
import { useUpstreamAccounts } from './upstream-accounts-provider'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: UpstreamAccount
}

export function UpstreamAccountsMutateDrawer(props: Props) {
  const { t } = useTranslation()
  const isUpdate = !!props.currentRow
  const { triggerRefresh } = useUpstreamAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<UpstreamAccountFormValues>({
    resolver: zodResolver(getUpstreamAccountFormSchema(t)),
    defaultValues: UPSTREAM_ACCOUNT_FORM_DEFAULT_VALUES,
  })

  // Load existing data when updating
  useEffect(() => {
    if (props.open && props.currentRow) {
      getUpstreamAccount(props.currentRow.id)
        .then((result) => {
          if (result.success && result.data) {
            form.reset(transformAccountToFormDefaults(result.data))
          }
        })
        .catch(() => undefined)
    } else if (props.open) {
      form.reset(UPSTREAM_ACCOUNT_FORM_DEFAULT_VALUES)
    }
  }, [props.open, props.currentRow, form])

  const onSubmit = async (values: UpstreamAccountFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToPayload(values)
      if (isUpdate && props.currentRow) {
        const result = await updateUpstreamAccount({
          ...payload,
          id: props.currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.ACCOUNT_UPDATED))
          props.onOpenChange(false)
          triggerRefresh()
        }
      } else {
        const result = await createUpstreamAccount(payload)
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.ACCOUNT_CREATED))
          props.onOpenChange(false)
          triggerRefresh()
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const typeOptions = getUpstreamAccountTypeOptions(t)
  const accountType = form.watch('type')

  return (
    <Sheet
      open={props.open}
      onOpenChange={(value) => {
        props.onOpenChange(value)
        if (!value) {
          form.reset()
        }
      }}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[600px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Update Account') : t('Add Account')}
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update the upstream account by providing necessary info.')
              : t(
                  'Add a new upstream account by providing necessary info.'
                )}{' '}
            {t('Click save when you&apos;re done.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='upstream-account-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Account name')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Enter the upstream account name')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('A display name to recognize this upstream.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Account Type')}</FormLabel>
                    <Select
                      items={typeOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {typeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t('Determines how the balance is fetched upstream.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='base_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Base URL')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='https://api.example.com'
                        autoComplete='off'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {accountType === 'new-api' && (
                <FormField
                  control={form.control}
                  name='upstream_user_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Upstream User ID')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={1}
                          onChange={(event) =>
                            field.onChange(
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'The user ID that owns the access token on the upstream panel (required by new-api style panels).'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <KeyRound className='h-4 w-4' />
                {t('Credentials')}
              </h3>
              <UpstreamAccountAuthFields control={form.control} />
            </SideDrawerSection>

            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <BellRing className='h-4 w-4' />
                {t('Alert Settings')}
              </h3>

              <FormField
                control={form.control}
                name='low_balance_threshold'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Low Balance Threshold')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min={0}
                        step={0.01}
                        onChange={(event) =>
                          field.onChange(
                            Number.parseFloat(event.target.value) || 0
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Alert when the balance falls below this value ({{currency}})',
                        { currency: getCurrencyLabel() }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <FormLabel className='!mt-0'>{t('Enabled')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='remark'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Remark')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Optional note about this upstream')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='upstream-account-form'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
