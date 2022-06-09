/*
 * Copyright © 2016-2022 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as React from 'react';
import {
  JsonFormData,
  JsonFormFieldProps,
  JsonFormFieldState
} from '@shared/components/json-form/react/json-form.models';

class ThingsboardFieldSet extends React.Component<JsonFormFieldProps, JsonFormFieldState> {

    render() {
        const forms = (this.props.form.items as JsonFormData[]).map((form: JsonFormData, index) => {
            return this.props.builder(form, this.props.model, index, this.props.onChange,
              this.props.onColorClick, this.props.onIconClick, this.props.onToggleFullscreen, this.props.onHelpClick, this.props.mapper);
        });

        return (
            <div style={{paddingTop: '20px'}}>
                <div className='tb-head-label'>
                    {this.props.form.title}
                </div>
                <div>
                    {forms}
                </div>
            </div>
        );
    }
}

export default ThingsboardFieldSet;
