import { useState } from 'react';
import { Divider, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
export default function SimpleMenuActions({testId, dropdownItems}: {testId?: string; dropdownItems: {
  key?: string; label?: string; isSpacer?: boolean; isDisabled?: boolean; onClick?: () => void;
}[]}) {
  const [open, setOpen] = useState(false);
  return <Dropdown isOpen={open} onOpenChange={setOpen} popperProps={{position: 'right'}}
    toggle={ref => <MenuToggle ref={ref} aria-label="Subscription actions" data-testid={testId} variant="plain" isExpanded={open} onClick={() => setOpen(!open)}><EllipsisVIcon /></MenuToggle>}>
    <DropdownList>{dropdownItems.map((item, index) => item.isSpacer ? <Divider key={index} component="li" /> :
      <DropdownItem key={item.key} isDisabled={item.isDisabled} onClick={() => { setOpen(false); item.onClick?.(); }}>{item.label}</DropdownItem>)}</DropdownList>
  </Dropdown>;
}
