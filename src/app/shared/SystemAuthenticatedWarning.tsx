// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/shared/SystemAuthenticatedWarning.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import { FormHelperText, HelperTextItem, HelperText } from '@patternfly/react-core';

const SystemAuthenticatedWarning: React.FC = () => (
  <FormHelperText data-testid="system-authenticated-warning">
    <HelperText>
      <HelperTextItem variant="warning">
        The <code>system:authenticated</code> group provides access to all users on this cluster.
      </HelperTextItem>
    </HelperText>
  </FormHelperText>
);

export default SystemAuthenticatedWarning;
