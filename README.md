
# D3DDred.js
This is a WinDbg Javascript extension that makes it much easier to debug D3D12 DRED (Device Removed Extended Data) state after a device removed event.

## Example
This example uses a broken version of the DirectX sample app ModelViewer.exe that causes device removal during the first frame.  To debug this, launch ModelViewer using WinDbg and load the D3DDred script any time after the device removal is triggered:
```
.scriptload <full path to D3DDred.js>
```

After loading the script, enter the command !d3ddred:
```
0:000> !d3ddred
@$d3ddred()                 : [object Object] [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA1]
    [<Raw View>]     [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA1]
    DeviceRemovedReason : 0x887a0006 (The GPU will not respond to more commands, most likely because of an invalid command passed by the calling application [Type: HRESULT]
    AutoBreadcrumbNodes : Count: 1
    PageFaultVA      : 0x29b450000
    ExistingAllocations : Count: 0
    RecentFreedAllocations : Count: 2

```
In this example, there is only one AutoBreadcrumbNode object.  Clicking on AutoBreadcrumbNodes shows:
```
(*((ModelViewer!D3D12_DEVICE_REMOVED_EXTENDED_DATA1 *)0x7fffee841a08)).AutoBreadcrumbNodes                 : Count: 1
    [0x0]            : 0x1e2ed2dcf58 : [object Object] [Type: D3D12_AUTO_BREADCRUMB_NODE *]
```
Click [0x0]:
```
((ModelViewer!D3D12_AUTO_BREADCRUMB_NODE *)0x1e2ed2dcf58)                 : 0x1e2ed2dcf58 : [object Object] [Type: D3D12_AUTO_BREADCRUMB_NODE *]
    [<Raw View>]     [Type: D3D12_AUTO_BREADCRUMB_NODE]
    CommandListDebugName : 0x1e2eceb04a0 : "ClearBufferCL" [Type: wchar_t *]
    CommandQueueDebugName : 0x1e2ecead4a0 : "CommandListManager::m_CommandQueue" [Type: wchar_t *]
    NumCompletedAutoBreadcrumbOps : 0x1
    NumAutoBreadcrumbOps : 0x3
    ReverseCompletedOps : [object Object]
    OutstandingOps   : [object Object
```
This shows that queue “CommandListManager::m_CommandQueue” and command list “ClearBufferCL” contain the likely suspect operation. 

The ReverseCompletedOps value is an array (in reverse order) of command list operations that completed without error:
```
((ModelViewer!D3D12_AUTO_BREADCRUMB_NODE *)0x1e2ed2dcf58)->ReverseCompletedOps                 : [object Object]
    [0x0]            : D3D12_AUTO_BREADCRUMB_OP_CLEARUNORDEREDACCESSVIEW (13) [Type: D3D12_AUTO_BREADCRUMB_OP]
```
This shows that a command list recording completed only one operation before faulting, which was a ClearUnorderedAccessView command.

The OutstandingOps value is an array (in normal forward order) of command list operations that are not guaranteed to have completed without error.
```
((ModelViewer!D3D12_AUTO_BREADCRUMB_NODE *)0x1e2ed2dcf58)->OutstandingOps                 : [object Object]
    [0x0]            : D3D12_AUTO_BREADCRUMB_OP_COPYRESOURCE (9) [Type: D3D12_AUTO_BREADCRUMB_OP]
    [0x1]            : D3D12_AUTO_BREADCRUMB_OP_RESOURCEBARRIER (15) [Type: D3D12_AUTO_BREADCRUMB_OP]
```
In most cases, the first outstanding operation is the strongest suspect.  The outstanding CopyResource operation shown here is in fact the culprit.

Looking back at the initial !d3ddred output, notice that PageFaultVA is not zero.  This is an indication that the GPU faulted due to a read or write error (and that the GPU supports reporting of page faults).  Beneath PageFaultVA is ExistingAllocations and RecentFreedAllocations.  These contain arrays of allocations that match the faulting virtual address.  Since ExistingAllocations is 0, it is not interesting in this case.  However, RecentFreedAllocations has two entries that match the faulting VA:
```
(*((ModelViewer!D3D12_DEVICE_REMOVED_EXTENDED_DATA1 *)0x7fffee841a08)).RecentFreedAllocations                 : Count: 2
    [0x0]            : 0x1e2e2599120 : [object Object] [Type: D3D12_DRED_ALLOCATION_NODE *]
    [0x1]            : 0x1e2e25990b0 : [object Object] [Type: D3D12_DRED_ALLOCATION_NODE *]
```
Allocation 0x0 is an internal heap object, and thus is not very interesting.  However, allocation 0x1 reveals:
```
((ModelViewer!D3D12_DRED_ALLOCATION_NODE *)0x1e2e25990b0)                 : 0x1e2e25990b0 : [object Object] [Type: D3D12_DRED_ALLOCATION_NODE *]
    [<Raw View>]     [Type: D3D12_DRED_ALLOCATION_NODE]
    ObjectName       : 0x1e2ed352730 : "UAVBuffer01" [Type: wchar_t *]
    AllocationType   : D3D12_DRED_ALLOCATION_TYPE_RESOURCE (34) [Type: D3D12_DRED_ALLOCATION_TYPE]
```
So, it seems that a buffer named “UAVBuffer01” that was associated with the faulting VA was recently deleted.
The verdict is that the CopyResource operation on CommandList “ClearBufferCL” tried to access buffer “UAVBuffer01” after it had been deleted.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
