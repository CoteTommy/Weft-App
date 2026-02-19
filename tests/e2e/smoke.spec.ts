import { expect, test } from '@playwright/test'

test.describe('weft ui smoke', () => {
  test('renders onboarding route on first load', async ({ page }) => {
    await page.goto('/welcome')
    await expect(page).toHaveURL(/\/welcome/)
    await expect(page.locator('body')).toContainText(/weft|welcome|profile|connectivity/i)
  })

  test('loads shell route with seeded onboarding preferences', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'weft.preferences.v1',
        JSON.stringify({
          onboardingCompleted: true,
          connectivityMode: 'automatic',
          autoStartDaemon: false,
          notificationsEnabled: false,
          inAppNotificationsEnabled: false,
          messageNotificationsEnabled: false,
          systemNotificationsEnabled: false,
          connectionNotificationsEnabled: false,
          notificationSoundEnabled: false,
          motionPreference: 'off',
          performanceHudEnabled: false,
          threadPageSize: 50,
          messagePageSize: 50,
          attachmentPreviewMode: 'on_demand',
          commandCenterEnabled: false,
          lastMainRoute: '/chats',
        })
      )
    })

    await page.goto('/chats')
    await expect(page).toHaveURL(/\/chats/)
    await expect(page.locator('body')).toBeVisible()
  })
})
