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
import { Clock } from 'lucide-react'
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

import {
  getUpstreamMonitorSettings,
  updateUpstreamMonitorSettings,
} from '../api'
import {
  MONITOR_SETTINGS_DEFAULT_VALUES,
  getEffectiveIntervalMinutes,
  getMonitorSettingsFormSchema,
  type MonitorSettingsFormValues,
} from '../lib/monitor-settings-form'
import { useUpstreamAccounts } from './upstream-accounts-provider'

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}))

export function MonitorSettingsDialog() {
  const { t } = useTranslation()
  const { open, setOpen } = useUpstreamAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<MonitorSettingsFormValues>({
    resolver: zodResolver(getMonitorSettingsFormSchema(t)),
    defaultValues: MONITOR_SETTINGS_DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open === 'schedule') {
      getUpstreamMonitorSettings()
        .then((result) => {
          if (result.success && result.data) {
            const { current_interval: _currentInterval, ...values } =
              result.data
            form.reset(values)
          }
        })
        .catch(() => undefined)
    }
  }, [open, form])

  const values = form.watch()
  const effectiveInterval = getEffectiveIntervalMinutes({
    peak_start_hour: values.peak_start_hour,
    peak_end_hour: values.peak_end_hour,
    peak_interval: values.peak_interval,
    off_peak_interval: values.off_peak_interval,
  })

  const onSubmit = async (formValues: MonitorSettingsFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await updateUpstreamMonitorSettings(formValues)
      if (result.success) {
        toast.success(t('Monitor settings saved successfully'))
        setOpen(null)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open === 'schedule'}
      onOpenChange={(value) => !value && setOpen(null)}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[520px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Schedule Settings')}</SheetTitle>
          <SheetDescription>{t('Scheduled balance check')}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='upstream-monitor-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <FormLabel className='!mt-0'>
                      {t('Enable scheduled balance check')}
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
            </SideDrawerSection>

            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <Clock className='h-4 w-4' />
                {t('Query frequency')}
              </h3>

              <div className='grid grid-cols-2 gap-3'>
                <FormField
                  control={form.control}
                  name='peak_start_hour'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Peak hours start')}</FormLabel>
                      <Select
                        items={HOUR_OPTIONS}
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {HOUR_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='peak_end_hour'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Peak hours end')}</FormLabel>
                      <Select
                        items={HOUR_OPTIONS}
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {HOUR_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='peak_interval'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Peak interval (minutes)')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='off_peak_interval'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Off-peak interval (minutes)')}</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormDescription>
                {t('Current interval: {{count}} minutes', {
                  count: effectiveInterval,
                })}
              </FormDescription>
              <FormDescription>
                {t(
                  'Balances are refreshed on this schedule; a low-balance email is sent only once per low-balance episode.'
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
            form='upstream-monitor-form'
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
