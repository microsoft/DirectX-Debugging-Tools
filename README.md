
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
@$d3ddred()                 : [object Object] [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA2]
    [<Raw View>]     [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA2]
    DeviceRemovedReason : 0x887a0006 (The GPU will not respond to more commands, most likely because of an invalid command passed by the calling applicat [Type: HRESULT]
    AutoBreadcrumbNodes : Count: 1
    PageFaultVA      : 0x286fd0000
    ExistingAllocations : Count: 0
    RecentFreedAllocations : Count: 1

```
In this example, there is only one AutoBreadcrumbNode object.  Clicking on AutoBreadcrumbNodes outputs:
```
0:000> dx -r1 (*((d3d12!D3D12_DEVICE_REMOVED_EXTENDED_DATA2 *)0x7ffa3365ccd8)).AutoBreadcrumbNodes
(*((d3d12!D3D12_DEVICE_REMOVED_EXTENDED_DATA2 *)0x7ffa3365ccd8)).AutoBreadcrumbNodes                 : Count: 1
    [0x0]            : 0x23fbd140308 : [object Object] [Type: D3D12_AUTO_BREADCRUMB_NODE1 *]
```
Click [0x0]:
```
0:000> dx -r1 ((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)                 : 0x23fbd140308 : [object Object] [Type: D3D12_AUTO_BREADCRUMB_NODE1 *]
    [<Raw View>]     [Type: D3D12_AUTO_BREADCRUMB_NODE1]
    BreadcrumbContexts : [object Object]
    CommandListDebugName : 0x0 [Type: wchar_t *]
    CommandQueueDebugName : 0x23fbbffb9c0 : "CommandListManager::m_CommandQueue" [Type: wchar_t *]
    NumCompletedAutoBreadcrumbOps : 0x3
    NumAutoBreadcrumbOps : 0x5
    ReverseCompletedOps : [object Object]
    OutstandingOps   : [object Object]
```
This shows that queue “CommandListManager::m_CommandQueue” and command list “ClearBufferCL” contain the likely suspect operation. 

The ReverseCompletedOps value is an array (in reverse order) of command list operations that completed without error.  If running on Windows 10 1903 or earlier, clicking on 'ReverseCompletedOps' outputs:
```
0:000> dx -r1 ((ModelViewer!D3D12_AUTO_BREADCRUMB_NODE *)0x23fbd140308)->ReverseCompletedOps                 : [object Object]
    [0x0]            : D3D12_AUTO_BREADCRUMB_OP_CLEARUNORDEREDACCESSVIEW (13) [Type: D3D12_AUTO_BREADCRUMB_OP]
```
This shows that a command list recording completed only one operation before faulting, which was a ClearUnorderedAccessView command.

As of DRED v1.2 (available in the Windows 10 20H1 preview release) auto-breadcrumbs includes PIX event and marker strings as 'context' data in the command history.  With PIX context support, clicking on 'ReverseCompletedOps will produce a table of operation ID's and context strings (if available):
```
0:000> dx -r1 ((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->ReverseCompletedOps
((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->ReverseCompletedOps                 : [object Object]
    [0x0]            : Op: [object Object], Context: [object Object]
    [0x1]            : Op: [object Object]
    [0x2]            : Op: [object Object], Context: [object Object]
```
At first glance, this seems less useful.  Context data is facilitated by WinDbg 'synthetic objects' and each synthetic object needs to be expanded individually.  Alternatively, repeating the click-generated dx command using -r2 (or even better -g) produces more complete output.  For example:
```
0:000> dx -r2 ((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->ReverseCompletedOps
((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->ReverseCompletedOps                 : [object Object]
    [0x0]            : Op: [object Object], Context: [object Object]
        Op               : D3D12_AUTO_BREADCRUMB_OP_SETMARKER (0) [Type: D3D12_AUTO_BREADCRUMB_OP]
        Context          : 0x23fc7c29840 : "FinishCommandContext" [Type: wchar_t *]
    [0x1]            : Op: [object Object]
        Op               : D3D12_AUTO_BREADCRUMB_OP_CLEARUNORDEREDACCESSVIEW (13) [Type: D3D12_AUTO_BREADCRUMB_OP]
    [0x2]            : Op: [object Object], Context: [object Object]
        Op               : D3D12_AUTO_BREADCRUMB_OP_SETMARKER (0) [Type: D3D12_AUTO_BREADCRUMB_OP]
        Context          : 0x23fbd389890 : "BeginCommandContext" [Type: wchar_t *]
```

This shows that successful ClearUnorderedAccessView occurred between PIXSetMarker("BeginCommandContext") and PIXSetMarker("FinishCommandContext").

The OutstandingOps value is an array (in normal forward order) of command list operations that are not guaranteed to have completed without error.

**DRED 1.1 output:**
```
0:000> dx -r1 ((ModelViewer!D3D12_AUTO_BREADCRUMB_NODE *)0x1e2ed2dcf58)->OutstandingOps                 : [object Object]
    [0x0]            : D3D12_AUTO_BREADCRUMB_OP_COPYRESOURCE (9) [Type: D3D12_AUTO_BREADCRUMB_OP]
    [0x1]            : D3D12_AUTO_BREADCRUMB_OP_RESOURCEBARRIER (15) [Type: D3D12_AUTO_BREADCRUMB_OP]
```

**DRED 1.2 output:**
```
0:000> dx -r2 ((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->OutstandingOps
((d3d12!D3D12_AUTO_BREADCRUMB_NODE1 *)0x23fbd140308)->OutstandingOps                 : [object Object]
    [0x0]            : Op: [object Object]
        Op               : D3D12_AUTO_BREADCRUMB_OP_COPYRESOURCE (9) [Type: D3D12_AUTO_BREADCRUMB_OP]
    [0x1]            : Op: [object Object]
        Op               : D3D12_AUTO_BREADCRUMB_OP_RESOURCEBARRIER (15) [Type: D3D12_AUTO_BREADCRUMB_OP]
```

In most cases, the first outstanding operation is the strongest suspect.  The outstanding CopyResource operation shown here is in fact the culprit.

Looking back at the initial !d3ddred output, notice that PageFaultVA is not zero.  This is an indication that the GPU faulted due to a read or write error (and that the GPU supports reporting of page faults).  Beneath PageFaultVA is ExistingAllocations and RecentFreedAllocations.  These contain arrays of allocations that match the faulting virtual address.  Since ExistingAllocations is 0, it is not interesting in this case.  However, RecentFreedAllocations has two entries that match the faulting VA:
```
0:000> dx -r1 (*((d3d12!D3D12_DEVICE_REMOVED_EXTENDED_DATA2 *)0x7ffa3365ccd8)).RecentFreedAllocations
(*((d3d12!D3D12_DEVICE_REMOVED_EXTENDED_DATA2 *)0x7ffa3365ccd8)).RecentFreedAllocations                 : Count: 1
    [0x0]            : 0x23fb121e0b0 : [object Object] [Type: D3D12_DRED_ALLOCATION_NODE1 *]
```
Allocation 0x0 is an internal heap object, and thus is not very interesting.  However, allocation 0x1 reveals:
```
0:000> dx -r1 ((d3d12!D3D12_DRED_ALLOCATION_NODE1 *)0x23fb121e0b0)
((d3d12!D3D12_DRED_ALLOCATION_NODE1 *)0x23fb121e0b0)                 : 0x23fb121e0b0 : [object Object] [Type: D3D12_DRED_ALLOCATION_NODE1 *]
    [<Raw View>]     [Type: D3D12_DRED_ALLOCATION_NODE1]
    ObjectName       : 0x23fbd475cf0 : "FooBuffer1" [Type: wchar_t *]
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
