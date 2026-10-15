import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { configureSubscriptionService } from '~/services/subscriptions/configuredService';
import { MockSubscriptionService } from '~/services/subscriptions/MockSubscriptionService';

it('collapses and expands navigation while keeping the header and settings accessible', async () => {
  configureSubscriptionService(new MockSubscriptionService());
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/tenants']}><App /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Cloud Provider Admin Console' })).toBeVisible();
  await screen.findByRole('heading', { name: 'Tenants' });
  const toggle = screen.getByRole('button', { name: 'Collapse navigation' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.click(toggle);
  expect(screen.queryByRole('navigation', { name: 'Portal navigation' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false');
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('menuitem', { name: 'REST API' })).toHaveAttribute('href', '/api/docs');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Expand navigation' }));
  const nav = screen.getByRole('navigation', { name: 'Portal navigation' });
  expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['AI Grid', 'Monitoring', 'Clusters', 'Tenants', 'Models', 'Subscriptions']);
  await user.click(within(nav).getByRole('link', { name: 'Subscriptions' }));
  expect(await screen.findByRole('heading', { name: 'Subscriptions' })).toBeVisible();
});
