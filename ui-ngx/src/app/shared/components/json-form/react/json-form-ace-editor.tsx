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
import * as ReactDOM from 'react-dom';
import ThingsboardBaseComponent from './json-form-base-component';
import reactCSS from 'reactcss';
import Button from '@material-ui/core/Button';
import { JsonFormFieldProps, JsonFormFieldState } from '@shared/components/json-form/react/json-form.models';
import { IEditorProps } from 'react-ace/src/types';
import { mergeMap } from 'rxjs/operators';
import { getAce } from '@shared/models/ace/ace.models';
import { from } from 'rxjs';
import { Observable } from 'rxjs/internal/Observable';
import { CircularProgress, IconButton } from '@material-ui/core';
import { MouseEvent } from 'react';
import { Help, HelpOutline } from '@material-ui/icons';

const ReactAce = React.lazy(() => {
  return getAce().pipe(
    mergeMap(() => {
      return from(import('react-ace'));
    })
  ).toPromise();
});

interface ThingsboardAceEditorProps extends JsonFormFieldProps {
  mode: string;
  onTidy: (value: string) => Observable<string>;
}

interface ThingsboardAceEditorState extends JsonFormFieldState {
  isFull: boolean;
  fullscreenContainerElement: Element;
  helpVisible: boolean;
  helpReady: boolean;
  focused: boolean;
}

class ThingsboardAceEditor extends React.Component<ThingsboardAceEditorProps, ThingsboardAceEditorState> {

    private aceEditor: IEditorProps;

    constructor(props) {
        super(props);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onFocus = this.onFocus.bind(this);
        this.onTidy = this.onTidy.bind(this);
        this.onHelp = this.onHelp.bind(this);
        this.onLoad = this.onLoad.bind(this);
        this.onToggleFull = this.onToggleFull.bind(this);
        const value = props.value ? props.value + '' : '';
        this.state = {
            isFull: false,
            fullscreenContainerElement: null,
            helpVisible: false,
            helpReady: true,
            value,
            focused: false
        };
    }

    onValueChanged(value) {
        this.setState({
            value
        });
        this.props.onChangeValidate({
            target: {
                value
            }
        });
    }

    onBlur() {
        this.setState({ focused: false });
    }

    onFocus() {
        this.setState({ focused: true });
    }

    onTidy() {
        if (!this.props.form.readonly) {
            const value = this.state.value;
            this.props.onTidy(value).subscribe(
              (processedValue) => {
                this.setState({
                  value: processedValue
                });
                this.props.onChangeValidate({
                  target: {
                    value: processedValue
                  }
                });
              }
            );
        }
    }

    onHelp(event: MouseEvent) {
      if (this.state.helpVisible && !this.state.helpReady) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        this.props.onHelpClick(event, this.props.form.helpId,
          (visible) => {
            this.setState({
              helpVisible: visible
            });
          }, (ready) => {
            this.setState({
              helpReady: ready
            });
          });
      }
    }

    onLoad(editor: IEditorProps) {
        this.aceEditor = editor;
    }

    onToggleFull() {
        this.props.onToggleFullscreen((el) => {
          this.setState({ isFull: !this.state.isFull, fullscreenContainerElement: el });
        });
    }

    componentDidUpdate() {
    }

    render() {

        const styles = reactCSS({
            default: {
                tidyButtonStyle: {
                    color: '#7B7B7B',
                    minWidth: '32px',
                    minHeight: '15px',
                    lineHeight: '15px',
                    fontSize: '0.800rem',
                    margin: '0',
                    padding: '4px',
                    height: '23px',
                    borderRadius: '5px',
                    marginLeft: '5px'
                }
            }
        });

        let labelClass = 'tb-label';
        if (this.props.form.required) {
            labelClass += ' tb-required';
        }
        if (this.props.form.readonly) {
            labelClass += ' tb-readonly';
        }
        if (this.state.focused) {
            labelClass += ' tb-focused';
        }
        let containerClass = 'tb-container';
        const style = this.props.form.style || {width: '100%'};
        if (this.state.isFull) {
            containerClass += ' fullscreen-form-field';
        }
        const formDom = (
          <div className={containerClass}>
            <label className={labelClass}>{this.props.form.title}</label>
            <div className='json-form-ace-editor'>
              <div className='title-panel'>
                <label>{this.props.mode}</label>
                { this.props.onTidy ? <Button style={ styles.tidyButtonStyle }
                                              className='tidy-button' onClick={this.onTidy}>Tidy</Button> : null }
                { this.props.form.helpId ? <div style={ {position: 'relative', display: 'inline-block', marginLeft: '5px'} }>
                  <IconButton color='primary'
                              className='help-button' onClick={this.onHelp}>
                    {this.state.helpVisible ? <Help /> : <HelpOutline /> }
                  </IconButton>
                  { this.state.helpVisible && !this.state.helpReady ?
                    <div className='tb-absolute-fill help-button-loading'>
                      <CircularProgress size={18} thickness={4}/>
                    </div> : null }</div> : null }
                <Button style={ styles.tidyButtonStyle }
                        className='tidy-button' onClick={this.onToggleFull}>
                  {this.state.isFull ?
                    'Exit fullscreen' : 'Fullscreen'}
                </Button>
              </div>
              <React.Suspense fallback={<div>Loading...</div>}>
                <ReactAce  mode={this.props.mode}
                           theme={'textmate'}
                           height={this.state.isFull ? '100%' : '150px'}
                           width={this.state.isFull ? '100%' : '300px'}
                           onChange={this.onValueChanged}
                           onFocus={this.onFocus}
                           onBlur={this.onBlur}
                           onLoad={this.onLoad}
                           name={this.props.form.title}
                           value={this.state.value}
                           readOnly={this.props.form.readonly}
                           editorProps={{$blockScrolling: Infinity}}
                           enableBasicAutocompletion={true}
                           enableSnippets={true}
                           enableLiveAutocompletion={true}
                           style={style}/>
              </React.Suspense>
            </div>
            <div className='json-form-error'
                 style={{opacity: this.props.valid ? '0' : '1'}}>{this.props.error}</div>
          </div>
        );
        if (this.state.isFull) {
          return ReactDOM.createPortal(formDom, this.state.fullscreenContainerElement);
        } else {
          return (
            <div>
                {formDom}
            </div>
          );
        }
    }
}

export default ThingsboardBaseComponent(ThingsboardAceEditor);
