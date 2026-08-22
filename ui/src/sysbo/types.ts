import type {SysBOMetadata,SysUserRole} from '@manatos/shared';
export interface SysBOListViewModel{title:string;addButtonText:string;showResultCount:boolean}
export interface SysBOEditViewModel{createTitle:string;editTitle:string;showDeleteButton:boolean;confirmUnsavedChanges:boolean}
export interface SysBOGridConfiguration{allowSorting:boolean;allowFiltering:boolean;responsive:boolean;showPlayAction?:boolean;visibleFields:string[]}
export interface SysBOFilterDefinition{mode:'and';allowMultipleFilters:boolean;fields:string[]}
export interface SysBOPaginationConfiguration{enabled:boolean;defaultPageSize:number;allowedPageSizes:number[];maxPageSize:number;showPageSizeSelector:boolean;showFirstLastButtons:boolean;maxVisiblePageButtons:number}
export interface SysBOUIMetadata{icon:string;listViewModel:SysBOListViewModel;editViewModel:SysBOEditViewModel;gridConfiguration:SysBOGridConfiguration;filterDefinition:SysBOFilterDefinition;paginationConfiguration:SysBOPaginationConfiguration}
/** BO metadata and UI metadata are deliberately separate categories in one UI definition. */
export interface SysBODefinition<T=unknown>{key:string;boMetadata:SysBOMetadata<T>;uiMetadata:SysBOUIMetadata;permissions:{view:SysUserRole[];create:SysUserRole[];edit:SysUserRole[];delete:SysUserRole[]}}
