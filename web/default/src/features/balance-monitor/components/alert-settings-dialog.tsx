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
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'

import { getUpstreamAlertSettings, updateUpstreamAlertSettings } from '../api'
import { SUCCESS_MESSAGES } from '../constants'
import {
  ALERT_SETTINGS_DEFAULT_VALUES,
  getAlertSettingsFormSchema,
  type AlertSettingsFormValues,
} from '../lib/alert-settings-form'
import { useUpstreamAccounts } from './upstream-accounts-provider'

export function AlertSettingsDialog() {
  const { t } = useTranslation()
  const { open, setOpen } = useUpstreamAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<AlertSettingsFormValues>({
    resolver: zodResolver(getAlertSettingsFormSchema(t)),
    defaultValues: ALERT_SETTINGS_DEFAULT_VALUES,
  })
  const emailEnabled = useWatch({
    control: form.control,
    name: 'email_enabled',
  })

  useEffect(() => {
    if (open === 'alerts') {
      getUpstreamAlertSettings()
        .then((result) => {
          if (result.success && result.data) {
            form.reset(result.data)
          }
        })
        .catch(() => undefined)
    }
  }, [open, form])

  const onSubmit = async (values: AlertSettingsFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await updateUpstreamAlertSettings({
        email_enabled: values.email_enabled,
        notification_email: values.notification_email.trim(),
      })
      if (result.success) {
        toast.success(t(SUCCESS_MESSAGES.ALERT_SETTINGS_SAVED))
        setOpen(null)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open === 'alerts'}
      onOpenChange={(value) => !value && setOpen(null)}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[520px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Email Alerts')}</SheetTitle>
          <SheetDescription>
            {t('Send email alerts when a balance is low')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='upstream-alert-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='email_enabled'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <FormLabel className='!mt-0'>
                      {t('Send email alerts when a balance is low')}
                    </FormLabel>
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
                name='notification_email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Notification Email')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!emailEnabled}
                        autoComplete='off'
                        placeholder='ops@example.com'
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Enter one or more email addresses separated by commas'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormDescription>
                {t(
                  'Alerts are sent through the site email service (SMTP) once an enabled account balance drops below its threshold. Configure SMTP under System Settings → Integrations.'
                )}
              </FormDescription>
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='upstream-alert-form'
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
