import { Alert, WizardFooter, useWizardContext } from '@patternfly/react-core';
export default function TenantWizardFooter({tenantValid,idpValid,saving,error,onSave,onCancel,isEdit}: {
  tenantValid:boolean;idpValid:boolean;saving:boolean;error?:string;onSave:()=>Promise<void>;onCancel:()=>void;isEdit:boolean;
}) {
  const {activeStep,goToNextStep,goToPrevStep}=useWizardContext();const review=activeStep.id==='tenant-review';
  const valid=tenantValid && (activeStep.id==='tenant-details' || idpValid);
  return <><div className="pf-v6-u-px-lg">{error && <Alert isInline variant="danger" title="Unable to save tenant">{error}</Alert>}</div>
    <WizardFooter activeStep={activeStep} onNext={()=>review ? onSave() : goToNextStep()}
      onBack={()=>activeStep.id==='tenant-details' ? onCancel() : goToPrevStep()} onClose={onCancel}
      nextButtonText={review ? isEdit ? 'Save changes' : 'Create tenant' : 'Next'} isNextDisabled={saving || !valid} isBackDisabled={saving}
      cancelButtonProps={{isDisabled:saving}} nextButtonProps={{isLoading:saving}} />
  </>;
}
