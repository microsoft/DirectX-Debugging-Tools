// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

"use strict";

const AutoBreadcrumbsBufferSizeInBytes = 65536;
const AutoBreadcrumbsCommandHistoryOffset = 4096;
const AutoBreadcrumbsCommandHistoryMax = (AutoBreadcrumbsBufferSizeInBytes - AutoBreadcrumbsCommandHistoryOffset) / 4;

function initializeScript()
{
    var symbolSource = "";

    class BreadcrumbOp
    {
        constructor(op, context)
        {
            this.__op = op;
            this.__context = context;
        }

        toString()
        {
            return "Op: " + this.__op + (this.__context ? ", Context: " + this.__context : "");
        }

        get Op() { return this.__op;}
        get Context() { return this.__context;}
    }

    // Produces an array from completed breadcrumb operations
    class CompletedOps
    {
        constructor(node)
        {
            this.__node = node;
            this.__completedOp = node.pLastBreadcrumbValue.dereference();
            this.__numOps = node.BreadcrumbCount;
        }

        *[Symbol.iterator]()
        {
            if(this.__numOps > AutoBreadcrumbsCommandHistoryMax)
            {
                host.diagnostics.debugLog("Number of command operations exceeds " + AutoBreadcrumbsCommandHistoryMax + ", the capacity of the AutoBreadcrumb command history")
                var totalDroppedCount = this.__numOps - AutoBreadcrumbsCommandHistoryMax;
                var completedDroppedCount = max(0, this.__completedOp - totalDroppedCount);
                host.diagnostics.debugLog("Total commands dropped: " + totalDroppedCount);
                host.diagnostics.debugLog("Completed commands dropped: " + completedDroppedCount);
            }

            var count = 0;
            
            // Seek to the last context index less than or equal to the completed op index
            var contextIndex = 0;
            while(contextIndex < this.__node.BreadcrumbContextsCount && this.__node.pBreadcrumbContexts[contextIndex].BreadcrumbIndex < this.__completedOp)
            {
                contextIndex++;
            }
            contextIndex--;

            // Iterate through each completed op and output the BreadcrumbOp
            while(count < this.__completedOp && count < AutoBreadcrumbsCommandHistoryMax)
            {
                var contextString = null;
                var index = this.__completedOp - count - 1;
                if(contextIndex >= 0 && this.__node.pBreadcrumbContexts[contextIndex].BreadcrumbIndex == index)
                {
                    contextString = this.__node.pBreadcrumbContexts[contextIndex].pContextString;
                    contextIndex--;
                }
                count++;
                var modIndex = index % AutoBreadcrumbsCommandHistoryMax;
                var op = host.typeSystem.marshalAs(this.__node.pCommandHistory[index], symbolSource, "D3D12_AUTO_BREADCRUMB_OP");
                yield new BreadcrumbOp(op, contextString);
            }
        }
    }

    // Produces an array from not-yet-completed breadcrumb operations
    class OutstandingOps
    {
        constructor(node)
        {
            this.__node = node;
            this.__completedOp = node.pLastBreadcrumbValue.dereference();
            this.__numOps = node.BreadcrumbCount;
        }

        *[Symbol.iterator]()
        {
            var outstanding = this.__numOps - this.__completedOp;
            var dropped = outstanding - AutoBreadcrumbsCommandHistoryMax;
            var remaining = outstanding - dropped;
            if( dropped > 0 )
            {
                host.diagnostics.debugLog("Only the last " + remaining + " of " + outstanding + " outstanding operations are available\n");
            }
            var start = Math.max(this.__completedOp, this.__numOps - AutoBreadcrumbsCommandHistoryMax);

            // Seek to the first contex index not less than the completed op index
            var contextIndex = 0;
            while(contextIndex < this.__node.BreadcrumbContextsCount && this.__node.pBreadcrumbContexts[contextIndex].BreadcrumbIndex < this.__completedOp)
            {
                contextIndex++;
            }

            for(var opIndex = start; opIndex < this.__numOps; ++opIndex)
            {
                var contextString = null;
                var index = opIndex % AutoBreadcrumbsCommandHistoryMax;
                if(contextIndex < this.__node.BreadcrumbContextsCount && 
                    this.__node.pBreadcrumbContexts[contextIndex].BreadcrumbIndex == index)
                {
                    contextString = this.__node.pBreadcrumbContexts[contextIndex].pContextString;
                    contextIndex++;
                }
                
                var op = host.typeSystem.marshalAs(this.__node.pCommandHistory[index], symbolSource, "D3D12_AUTO_BREADCRUMB_OP");
                yield new BreadcrumbOp(op, contextString);
            }
        }
    }

    class BreadcrumbContexts
    {
        constructor(node)
        {
            this.__node = node;
            this.__contextCount = node.BreadcrumbContextsCount;
        }

        *[Symbol.iterator]()
        {
            for(var i = 0; i < this.__contextCount; ++i)
            {
                yield this.__node.pBreadcrumbContexts[i];
            }
        }
    }

    // Helper function for choosing wide vs narrow name string (prefer narrow)
    function SelectNameHelper(pNameA, pNameW)
    {
        // If the ascii name pointer is not null then select it
        if(pNameA.isNull)
        {
            return pNameW;
        }
        else
        {
            return pNameA;
        }
    }

    // Visualizer class for D3D12_AUTO_BREADCRUMB_NODE
    class AutoBreadcrumbNodeVis
    {
        get CommandListDebugName() { return SelectNameHelper(this.pCommandListDebugNameA, this.pCommandListDebugNameW);}
        get CommandQueueDebugName() { return SelectNameHelper(this.pCommandQueueDebugNameA, this.pCommandQueueDebugNameW);}
        get NumCompletedAutoBreadcrumbOps() { return this.pLastBreadcrumbValue.dereference(); }
        get NumAutoBreadcrumbOps() { return this.BreadcrumbCount; }
        get ReverseCompletedOps() { return new CompletedOps(this); }
        get OutstandingOps() { return new OutstandingOps(this); }
    }

    // Visualizer class for D3D12_AUTO_BREADCRUMB_NODE1
    class AutoBreadcrumbNode1Vis extends AutoBreadcrumbNodeVis
    {
        get BreadcrumbContexts() { return new BreadcrumbContexts(this); }
    }

    // Helper class for creating an array from linked list elements
    class LinkedDredNodesToArray
    {
        constructor(headNode)
        {
            const CreateArray = host.namespace.Debugger.Utility.Collections.CreateArray;
            if(!headNode.isNull)
            {
                var array = CreateArray(headNode).Flatten(function(node) 
                    { return node.pNext.isNull ? null : CreateArray(node.pNext); });            
                this.__nodes = array
            }
            else
            {
                this.__nodes = CreateArray();
            }
        }

        toString()
        {
            return "Count: " + this.__nodes.Count();
        }

        *[Symbol.iterator]()
        {
            for(var node of this.__nodes)
            {
                yield node;
            }
        }
    }

    // Visualizer class for D3D12_DEVICE_REMOVED_EXTENDED_DATA
    class DeviceRemovedExtendedDataVis
    {
        get AutoBreadcrumbNodes()
        {
            return new LinkedDredNodesToArray(this.pHeadAutoBreadcrumbNode);
        }
    }

    // Visualizer class for D3D12_DEVICE_REMOVED_EXTENDED_DATA1
    class DeviceRemovedExtendedData1Vis
    {
        get DeviceRemovedReason()
        {
            return host.typeSystem.marshalAs(this.DeviceRemovedReason, symbolSource, "HRESULT"); 
        }
        
        get AutoBreadcrumbNodes()
        {
            return new LinkedDredNodesToArray(this.AutoBreadcrumbsOutput.pHeadAutoBreadcrumbNode);
        }

        get PageFaultVA()
        {
            return this.PageFaultOutput.PageFaultVA;
        }

        get ExistingAllocations()
        {
            return new LinkedDredNodesToArray(this.PageFaultOutput.pHeadExistingAllocationNode);
        }

        get RecentFreedAllocations()
        {
            return new LinkedDredNodesToArray(this.PageFaultOutput.pHeadRecentFreedAllocationNode );
        }
    }

    // Visualizer class for D3D12_DEVICE_REMOVED_EXTENDED_DATA2
    class DeviceRemovedExtendedData2Vis
    {
        get DeviceRemovedReason()
        {
            return host.typeSystem.marshalAs(this.DeviceRemovedReason, symbolSource, "HRESULT");
        }
        
        get AutoBreadcrumbNodes()
        {
            return new LinkedDredNodesToArray(this.AutoBreadcrumbsOutput.pHeadAutoBreadcrumbNode);
        }

        get PageFaultVA()
        {
            return this.PageFaultOutput.PageFaultVA;
        }

        get ExistingAllocations()
        {
            return new LinkedDredNodesToArray(this.PageFaultOutput.pHeadExistingAllocationNode);
        }

        get RecentFreedAllocations()
        {
            return new LinkedDredNodesToArray(this.PageFaultOutput.pHeadRecentFreedAllocationNode );
        }
    }

    // Visualizer class for D3D12_DRED_ALLOCATION_NODE
    class DredAllocationNodeVis
    {
        get ObjectName()
        {
            return SelectNameHelper(this.ObjectNameA, this.ObjectNameW);
        }

        get AllocationType()
        {
            return host.typeSystem.marshalAs(this.AllocationType, symbolSource, "D3D12_DRED_ALLOCATION_TYPE");
        }
    }

    // Visualizer class for D3D12_DRED_ALLOCATION_NODE1
    class DredAllocationNode1Vis extends DredAllocationNodeVis
    {
    }

    // Visualizer class for D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA
    class VersionedDeviceRemovedExtendedDataVis
    {
        get DREDVersion() { return this["Version"]; }
        get Data()
        {
            switch(this["Version"])
            {
                case 1:
                return this.Dred_1_0;
                break;

                case 2:
                return this.Dred_1_1;
                break;

                case 3:
                return this.Dred_1_2;
                break;

                case 4:
                return this.Dred_1_3;
                break;

                default:
                return Error("Invalid or corrupt version data");
                break;
            }
        }
    }

    function __d3d12DeviceRemovedExtendedData()
    {
        // The D3D12 has been refactored into D3D12.dll and D3D12Core.dll.  On systems with this
        // refactoring, D3D12DeviceRemovedExtendedData is hosted in D3D12Core.dll.
        symbolSource = "d3d12core";
        var x = host.getModuleSymbolAddress(symbolSource, "D3D12DeviceRemovedExtendedData");
        
        if (x == null)
        {
            // Otherwise DRED data is located in d3d12.dll.
            symbolSource = "d3d12";
            x = host.getModuleSymbolAddress(symbolSource, "D3D12DeviceRemovedExtendedData");
        }

        // Need to cast the return type to D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA
        // since this information is stripped out of the public PDB
        try
        {
            // First try using the D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA symbol contained
            // in d3d12.pdb.  Legacy public d3d12 pdb's do not have this type information at all.
            var dred = host.createTypedObject(x, symbolSource, "D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA");
            return dred.Data;
        }
        catch(err)
        {
            // host.namespace.Debugger.Sessions[0].Processes[0].Modules[0].Name
            // Iterate through the loaded modules attempt the cast.
            // Note: the first loaded module is the application .exe.  If the app
            // has the DRED symbols loaded then this should go quick.
            for(var m of host.currentProcess.Modules)
            {
                try
                {
                    symbolSource = m.Name;
                    var dred = host.createTypedObject(x, symbolSource, "D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA");
                    return dred.Data;
                }
                catch(err)
                {
                    // Skip to the next one
                }
            }
        }
        
        // None of the symbols contain 
        host.diagnostics.debugLog("ERROR: D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA not found in any loaded symbol files.\n")
        return null;
    }

    return [ new host.typeSignatureRegistration(VersionedDeviceRemovedExtendedDataVis, "D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA"),
             new host.typeSignatureRegistration(DeviceRemovedExtendedDataVis, "D3D12_DEVICE_REMOVED_EXTENDED_DATA"),
             new host.typeSignatureRegistration(DeviceRemovedExtendedData1Vis, "D3D12_DEVICE_REMOVED_EXTENDED_DATA1"),
             new host.typeSignatureRegistration(DeviceRemovedExtendedData2Vis, "D3D12_DEVICE_REMOVED_EXTENDED_DATA2"),
             new host.typeSignatureRegistration(AutoBreadcrumbNodeVis, "D3D12_AUTO_BREADCRUMB_NODE"),
             new host.typeSignatureRegistration(AutoBreadcrumbNode1Vis, "D3D12_AUTO_BREADCRUMB_NODE1"),
             new host.typeSignatureRegistration(DredAllocationNodeVis, "D3D12_DRED_ALLOCATION_NODE"),
             new host.typeSignatureRegistration(DredAllocationNode1Vis, "D3D12_DRED_ALLOCATION_NODE1"),
             new host.functionAlias(__d3d12DeviceRemovedExtendedData, "d3ddred")];
}

function uninitializeScript()
{
}
