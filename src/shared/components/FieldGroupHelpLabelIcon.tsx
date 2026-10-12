import { Button, Popover } from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import type { ComponentProps } from 'react';
export default function FieldGroupHelpLabelIcon({title, content}: {
  title?: ComponentProps<typeof Popover>['headerContent']; content: ComponentProps<typeof Popover>['bodyContent'];
}) {
  return <Popover headerContent={title} bodyContent={content}><Button variant="plain" aria-label="More info" icon={<OutlinedQuestionCircleIcon />} /></Popover>;
}
