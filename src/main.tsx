import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@patternfly/react-core/dist/styles/base.css';
import '@patternfly/patternfly/patternfly-addons.css';
import './style.css';
import App from './app/App';
import { configureSubscriptionService } from './services/subscriptions/configuredService';
import { MockSubscriptionService } from './services/subscriptions/MockSubscriptionService';
import { HttpSubscriptionService } from './services/subscriptions/HttpSubscriptionService';
configureSubscriptionService(import.meta.env.VITE_SUBSCRIPTION_SERVICE === 'http'
  ? new HttpSubscriptionService(import.meta.env.VITE_API_BASE_URL ?? '/api')
  : new MockSubscriptionService({storage:localStorage,delay:150}));
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
