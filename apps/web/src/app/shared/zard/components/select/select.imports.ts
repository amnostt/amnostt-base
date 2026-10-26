import {
  ZardSelectGroupComponent,
  ZardSelectLabelComponent,
  ZardSelectSeparatorComponent,
} from '@/shared/zard/components/select/select-group.component';
import { ZardSelectItemComponent } from '@/shared/zard/components/select/select-item.component';
import { ZardSelectComponent } from '@/shared/zard/components/select/select.component';

export const ZardSelectImports = [
  ZardSelectComponent,
  ZardSelectGroupComponent,
  ZardSelectItemComponent,
  ZardSelectLabelComponent,
  ZardSelectSeparatorComponent,
] as const;
