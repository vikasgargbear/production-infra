import path from 'path';

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import type { UiStep } from './contracts';

const COMMUNICATION_ACTION = /whats?app|e-?mail|sms|text message|phone|call|tel:/i;

function locatorFor(page: Page, step: UiStep): Locator {
  const target = step.locator;
  if (!target) throw new Error(`${step.action} requires a locator.`);
  switch (target.kind) {
    case 'role':
      if (!target.role) throw new Error('Role locator requires role.');
      return page.getByRole(target.role as any, { name: target.name, exact: target.exact });
    case 'label': return page.getByLabel(target.name, { exact: target.exact });
    case 'placeholder': return page.getByPlaceholder(target.name, { exact: target.exact });
    case 'text': return page.getByText(target.name, { exact: target.exact });
    case 'testId': return page.getByTestId(target.name);
    default: throw new Error(`Unsupported locator kind: ${(target as any).kind}`);
  }
}

export async function runUiStep(page: Page, appOrigin: string, step: UiStep): Promise<void> {
  if (step.action === 'click' && (COMMUNICATION_ACTION.test(step.locator?.name || '')
    || COMMUNICATION_ACTION.test(step.value || ''))) {
    throw new Error('Communication actions are forbidden in live18 certification.');
  }
  if (step.action === 'goto') {
    if (!step.value?.startsWith('/')) throw new Error('goto requires an application-relative path.');
    const target = `${appOrigin}${step.value}`;
    // Hash routers do not remount when asked to navigate to the URL already
    // displayed. Each Live18 phase must start from a fresh product state.
    if (page.url() === target) await page.reload();
    else await page.goto(target);
    return;
  }
  const locator = locatorFor(page, step);
  await expect(
    locator,
    `${step.action} must resolve exactly one deterministic desktop target`,
  ).toHaveCount(1);
  switch (step.action) {
    case 'click': await locator.click(); break;
    case 'fill': await locator.fill(step.value ?? ''); break;
    case 'select': await locator.selectOption(step.value ?? ''); break;
    case 'setInputFiles':
      if (!step.value || !path.isAbsolute(step.value)) {
        throw new Error('setInputFiles requires an absolute reviewed artifact path.');
      }
      await locator.setInputFiles(step.value);
      break;
    case 'press': await locator.press(step.value ?? ''); break;
    case 'expectText': await expect(locator).toContainText(step.value ?? ''); break;
    case 'expectDisabled': await expect(locator).toBeDisabled(); break;
    default: throw new Error(`Unsupported UI action: ${step.action}`);
  }
}
