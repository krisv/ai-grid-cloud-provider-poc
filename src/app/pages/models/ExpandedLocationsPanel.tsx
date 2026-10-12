import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

export default function ExpandedLocationsPanel({locations}: {locations:string[]}) {
  return <Table aria-label="Locations" data-testid="locations-expanded-panel" variant="compact" borders>
    <Thead><Tr><Th>Location name</Th></Tr></Thead>
    <Tbody>{locations.length===0 ? <Tr><Td>No locations</Td></Tr> :
      locations.map(location=><Tr key={location}><Td dataLabel="Location name">{location}</Td></Tr>)}</Tbody>
  </Table>;
}
