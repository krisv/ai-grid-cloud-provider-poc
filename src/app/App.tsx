import { Alert, AlertGroup, AlertActionCloseButton, Masthead, MastheadBrand, MastheadContent, MastheadLogo, MastheadMain, MastheadToggle,
  Dropdown, DropdownItem, DropdownList, MenuToggle, Nav, NavItem, NavList, Page, PageSection, PageSidebar, PageSidebarBody, PageToggleButton, Title } from '@patternfly/react-core';
import { CogIcon } from '@patternfly/react-icons';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MaaSGovernanceProvider } from './context/MaaSGovernanceContext';
import CreateSubscriptionPage from './pages/subscriptions/CreateSubscriptionPage';
import EditSubscriptionPage from './pages/subscriptions/EditSubscriptionPage';
import ViewSubscriptionPage from './pages/subscriptions/ViewSubscriptionPage';
import SubscriptionsTab from './pages/maas-governance/SubscriptionsTab';
import ModelsPage from './pages/models/ModelsPage';
import ModelWizard from './pages/models/ModelWizard';
import TenantListPage from './pages/tenants/TenantListPage';
import TenantWizardPage from './pages/tenants/TenantWizardPage';
import TenantDetailsPage from './pages/tenants/TenantDetailsPage';
import ClustersPage from './pages/clusters/ClustersPage';
import { useEffect, useState } from 'react';
export default function App() {
  const location=useLocation();const [notice,setNotice]=useState<string>();
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  useEffect(()=>{const state=location.state as {notice?:string} | null;if(state?.notice)setNotice(state.notice);},[location]);
  const masthead=<Masthead className="portal-masthead" display={{default:'inline'}}>
    <MastheadMain><MastheadToggle><PageToggleButton isHamburgerButton isSidebarOpen={sidebarOpen}
      onSidebarToggle={()=>setSidebarOpen(open=>!open)} aria-label={sidebarOpen?'Collapse navigation':'Expand navigation'} aria-controls="portal-sidebar" /></MastheadToggle>
    <MastheadBrand><MastheadLogo component="div"><Title headingLevel="h2" size="lg">Cloud Provider Admin Console</Title></MastheadLogo></MastheadBrand></MastheadMain>
    <MastheadContent><div className="portal-masthead-tools">
      <Dropdown isOpen={settingsOpen} onOpenChange={setSettingsOpen} onSelect={()=>setSettingsOpen(false)} popperProps={{position:'right'}}
        toggle={ref=><MenuToggle ref={ref} variant="plain" aria-label="Settings" isExpanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><CogIcon /></MenuToggle>}>
        <DropdownList><DropdownItem key="rest-api" to="/api/docs">REST API</DropdownItem></DropdownList>
      </Dropdown>
    </div></MastheadContent></Masthead>;
  const sidebar=<PageSidebar id="portal-sidebar" isSidebarOpen={sidebarOpen}><PageSidebarBody><Nav aria-label="Portal navigation"><NavList>
    <NavItem isActive={location.pathname.startsWith('/clusters')}><Link to="/clusters">Clusters</Link></NavItem>
    <NavItem isActive={location.pathname.startsWith('/tenants')}><Link to="/tenants">Tenants</Link></NavItem>
    <NavItem isActive={location.pathname.startsWith('/models')}><Link to="/models">Models</Link></NavItem>
    <NavItem isActive={location.pathname.startsWith('/subscriptions')}><Link to="/subscriptions">Subscriptions</Link></NavItem>
  </NavList></Nav></PageSidebarBody></PageSidebar>;
  return <MaaSGovernanceProvider><Page masthead={masthead} sidebar={sidebar}>
    {notice && <AlertGroup isToast><Alert variant="success" title={notice} actionClose={<AlertActionCloseButton onClose={()=>setNotice(undefined)} />} /></AlertGroup>}
    <Routes><Route path="/" element={<Navigate to="/clusters" replace />} />
      <Route path="/clusters" element={<ClustersPage />} />
      <Route path="/tenants" element={<TenantListPage />} />
      <Route path="/tenants/create" element={<TenantWizardPage />} />
      <Route path="/tenants/:tenantName/edit" element={<TenantWizardPage />} />
      <Route path="/tenants/view/:tenantName" element={<TenantDetailsPage />} />
      <Route path="/subscriptions" element={<><PageSection><Title headingLevel="h1" size="2xl">Subscriptions</Title><p>Manage subscriptions to models available through Models as a Service.</p></PageSection><SubscriptionsTab /></>} />
      <Route path="/models" element={<ModelsPage />} />
      <Route path="/models/deploy" element={<ModelWizard />} />
      <Route path="/subscriptions/create" element={<CreateSubscriptionPage />} />
      <Route path="/subscriptions/edit/:subscriptionName" element={<EditSubscriptionPage />} />
      <Route path="/subscriptions/view/:subscriptionName" element={<ViewSubscriptionPage />} />
      <Route path="*" element={<PageSection><Title headingLevel="h1">Page not found</Title><Link to="/clusters">Go to clusters</Link></PageSection>} />
    </Routes>
  </Page></MaaSGovernanceProvider>;
}
