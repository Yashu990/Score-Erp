import CrudPage from '../components/CrudPage';

export default function Clusters() {
  return (
    <CrudPage
      title="Skill Clusters"
      endpoint="/clusters"
      singular="Cluster"
      searchable={false}
      columns={[
        { key: 'name', label: 'Cluster', render: (r) => <strong>{r.name}</strong> },
        { key: 'village', label: 'Village' },
        { key: 'description', label: 'Description' },
        {
          key: 'beneficiary_count',
          label: 'Beneficiaries',
          render: (r) => <span className="badge">{r.beneficiary_count ?? 0}</span>,
        },
      ]}
      fields={[
        { name: 'name', label: 'Cluster Name', required: true, full: true },
        { name: 'village', label: 'Village' },
        { name: 'description', label: 'Description', type: 'textarea', full: true },
      ]}
    />
  );
}
