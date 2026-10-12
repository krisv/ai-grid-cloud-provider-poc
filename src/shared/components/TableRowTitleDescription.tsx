// Adapted from frontend/src/components/table/TableRowTitleDescription.tsx
// opendatahub-io/odh-dashboard commit 8051fbbea117457b4da4074fb2856b732e6677a4
import type { ReactNode } from 'react';
export default function TableRowTitleDescription({title, subtitle, description, truncateDescriptionLines}: {
  title: ReactNode; subtitle?: ReactNode; description?: ReactNode; truncateDescriptionLines?: number;
}) {
  return <div><div data-testid="table-row-title">{title}</div>{subtitle}
    {description && <span data-testid="table-row-title-description" style={{color: 'var(--pf-t--global--text--color--subtle)',
      display: '-webkit-box', WebkitLineClamp: truncateDescriptionLines, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{description}</span>}
  </div>;
}
